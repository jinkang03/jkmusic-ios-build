/**
 * 手动下载索引：`<source>:<id>` → 本地文件。
 *
 * 播放取流时优先用这里（用户主动下载的，通常音质更高、离线可播）。
 * 与播放缓存（musicCache/）完全独立：
 *   - 索引持久化在 MMKV，启动直接读，不扫盘
 *   - 首次没有索引时后台扫一遍 downloads/ 的 sidecar，扫完落盘
 *   - 下载完成 / 删除下载时增量更新
 *   - 命中后校验文件存在与大小，失效则剔除并回退
 */
import * as FileSystem from 'expo-file-system/legacy'

import { logInfo } from '@/helpers/logger'
import getOrCreateMMKV from '@/store/getOrCreateMMKV'

const STORE_KEY = 'index_v1'
const AUDIO_EXT = /\.(flac|mp3|m4a|wav|aac|ogg)$/i
const QUALITY_RANK: Record<string, number> = { flac: 3, '320k': 2, '128k': 1 }

export type DownloadEntry = {
	uri: string
	quality?: string
	mtime: number
	size: number
}

type StoreShape = Record<string, DownloadEntry>

let store: any = null
const getStore = () => {
	if (!store) {
		try {
			store = getOrCreateMMKV('jk_download_index')
		} catch {
			const memory = new Map<string, string>()
			store = {
				getString: (k: string) => memory.get(k),
				set: (k: string, v: string) => { memory.set(k, v) },
			}
		}
	}
	return store
}

const entries = new Map<string, DownloadEntry>()
let loaded = false
let builtOnce = false
let buildPromise: Promise<void> | null = null

const keyOf = (source: string, id: string) => `${String(source ?? '')}:${String(id ?? '')}`

const downloadRoot = () => `${String((FileSystem as any).documentDirectory ?? '')}downloads/`

const fileUri = (pathOrUri: string) =>
	pathOrUri.startsWith('file://') ? pathOrUri : `file://${pathOrUri}`

const loadPersisted = () => {
	if (loaded) return
	loaded = true
	try {
		const raw = getStore().getString(STORE_KEY)
		if (!raw) return
		const data = JSON.parse(raw) as StoreShape
		for (const [key, value] of Object.entries(data ?? {})) {
			if (value?.uri) entries.set(key, value)
		}
	} catch { /* 索引损坏就当空 */ }
}

const persist = () => {
	try {
		const out: StoreShape = {}
		for (const [key, value] of entries) out[key] = value
		getStore().set(STORE_KEY, JSON.stringify(out))
	} catch { /* ignore */ }
}

const readSidecarMeta = async(audioUri: string): Promise<any | null> => {
	const base = audioUri.replace(AUDIO_EXT, '')
	try {
		const info: any = await (FileSystem as any).getInfoAsync(`${base}.json`)
		if (!info?.exists) return null
		const text = await (FileSystem as any).readAsStringAsync(`${base}.json`, { encoding: 'utf8' })
		return JSON.parse(text)
	} catch {
		return null
	}
}

/** 扫描 downloads/ 重建索引（只在没有持久化索引时执行一次） */
const buildFromDisk = async() => {
	const root = downloadRoot()
	try {
		const rootInfo: any = await (FileSystem as any).getInfoAsync(root)
		if (!rootInfo?.exists) {
			logInfo('[dlIndex] downloads 目录不存在')
			return
		}
		const folders: string[] = await (FileSystem as any).readDirectoryAsync(root)
		let count = 0
		for (const folder of folders ?? []) {
			const dir = `${root}${folder}/`
			let files: string[] = []
			try {
				const st: any = await (FileSystem as any).getInfoAsync(dir)
				if (!st?.exists || !st.isDirectory) continue
				files = await (FileSystem as any).readDirectoryAsync(dir)
			} catch { continue }
			for (const file of files ?? []) {
				if (!AUDIO_EXT.test(file)) continue
				const uri = fileUri(`${dir}${file}`)
				const meta = await readSidecarMeta(uri)
				const source = String(meta?.source ?? '')
				const id = String(meta?.sourceId ?? '')
				if (!source || !id) continue // 老下载没有来源信息：不按歌名猜
				let size = 0
				let mtime = Date.now()
				try {
					const st: any = await (FileSystem as any).getInfoAsync(uri)
					if (!st?.exists) continue
					size = Number(st.size ?? 0)
					mtime = Number(st.modificationTime ?? 0) * 1000 || Date.now()
				} catch { continue }
				const key = keyOf(source, id)
				const prev = entries.get(key)
				const next: DownloadEntry = { uri, quality: String(meta?.quality ?? ''), mtime, size }
				if (!prev || shouldReplace(prev, next)) entries.set(key, next)
				count++
			}
		}
		persist()
		logInfo('[dlIndex] 索引构建完成', 'entries=', entries.size, 'scanned=', count)
	} catch (err) {
		logInfo('[dlIndex] 扫描失败', String((err as any)?.message ?? err))
	}
}

const shouldReplace = (prev: DownloadEntry, next: DownloadEntry) => {
	const rp = QUALITY_RANK[String(prev.quality ?? '')] ?? 0
	const rn = QUALITY_RANK[String(next.quality ?? '')] ?? 0
	if (rn !== rp) return rn > rp
	return next.mtime > prev.mtime
}

/** 确保索引可用（首次后台扫描；调用方可选择等待一小段时间） */
/**
 * 校验索引里的文件是否还在（外部删除 / 系统清理后索引会过期）。
 * 只 stat，不读内容；几十首也就几十次 getInfoAsync。
 */
const validateEntries = async() => {
	if (!entries.size) return
	let changed = false
	for (const [key, entry] of Array.from(entries)) {
		try {
			const info: any = await (FileSystem as any).getInfoAsync(entry.uri)
			if (!info?.exists || Number(info.size ?? 0) <= 0) {
				entries.delete(key)
				changed = true
				logInfo('[dlIndex] 启动校验剔除失效项', key)
			}
		} catch { /* 读不到就保留，播放时还会再校验 */ }
	}
	if (changed) persist()
}

export const ensureDownloadIndex = (): Promise<void> => {
	loadPersisted()
	if (buildPromise) return buildPromise
	buildPromise = (async() => {
		if (!builtOnce) {
			await buildFromDisk()
			builtOnce = true
		}
		// 每次启动都校验一遍：文件被外部删掉时，标记不会一直挂着
		await validateEntries()
	})().finally(() => { buildPromise = null })
	return buildPromise
}

/** 同步：全部已下载的 key（给「已缓存」标记合并用） */
export const getDownloadedKeys = (): string[] => {
	loadPersisted()
	return Array.from(entries.keys())
}

/** 同步：某首是否手动下载过（不校验文件，标记用） */
export const hasDownloadedSync = (source?: string, id?: string): boolean => {
	const key = keyOf(source ?? '', id ?? '')
	if (key === ':') return false
	loadPersisted()
	return entries.has(key)
}

/**
 * 查某首歌的手动下载。
 * - **不等待建索引**：没就绪就当没有下载，直接走在线（保证点播零等待）
 * - 命中后校验文件存在；失效则剔除并返回 undefined（回退缓存/网络）
 */
export const getDownloadedUri = async(
	source?: string,
	id?: string,
): Promise<string | undefined> => {
	const key = keyOf(source ?? '', id ?? '')
	if (key === ':') return undefined
	loadPersisted()
	if (!entries.size) {
		// 后台建索引，不阻塞播放
		void ensureDownloadIndex()
		return undefined
	}
	const hit = entries.get(key)
	if (!hit) return undefined
	try {
		const info: any = await (FileSystem as any).getInfoAsync(hit.uri)
		if (!info?.exists || Number(info.size ?? 0) <= 0) {
			logInfo('[dlIndex] 文件已失效，剔除', key)
			entries.delete(key)
			persist()
			return undefined
		}
		return hit.uri
	} catch {
		return hit.uri
	}
}

/** 下载完成后写入索引 */
export const upsertDownloaded = async(params: {
	uri: string
	source?: string
	sourceId?: string
	quality?: string
}) => {
	loadPersisted()
	const key = keyOf(params.source ?? '', params.sourceId ?? '')
	if (key === ':' || !params.uri) return
	const uri = fileUri(params.uri)
	let size = 0
	let mtime = Date.now()
	try {
		const st: any = await (FileSystem as any).getInfoAsync(uri)
		size = Number(st?.size ?? 0)
		mtime = Number(st?.modificationTime ?? 0) * 1000 || Date.now()
	} catch { /* ignore */ }
	const next: DownloadEntry = { uri, quality: String(params.quality ?? ''), mtime, size }
	const prev = entries.get(key)
	if (!prev || shouldReplace(prev, next)) entries.set(key, next)
	persist()
	logInfo('[dlIndex] 已登记', key, String(params.quality ?? ''))
}

/** 删除下载后同步剔除 */
export const removeDownloaded = (uriOrPath: string) => {
	loadPersisted()
	const target = fileUri(String(uriOrPath ?? ''))
	let changed = false
	for (const [key, value] of entries) {
		if (value.uri === target) {
			entries.delete(key)
			changed = true
		}
	}
	if (changed) persist()
}
