/**
 * 手动下载的目录、命名与 sidecar（歌曲信息/歌词/封面）。
 *
 * 目录：Documents/downloads/<歌单名>/ 或 Documents/downloads/试听/
 * 文件：<download.fileName 模板>.flac|.mp3
 * 同名 sidecar：.json（完整信息）/ .lrc（歌词）/ .jpg（封面）
 *
 * 与播放缓存（musicCache/）完全分离，LRU 不会删这里的文件。
 */
import * as FileSystem from 'expo-file-system/legacy'
import { fileUriFromPath } from '@/helpers/localFile'
import { getSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'

export const DOWNLOAD_ROOT = `${(FileSystem as any).documentDirectory}downloads/`

const ILLEGAL = /[\\/:*?"<>|]/g
const stripControl = (text: string) => Array.from(text).filter(ch => ch.charCodeAt(0) >= 32).join('')

export const sanitizeName = (value: any, fallback = '未命名') => {
	const text = stripControl(String(value ?? '')).replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim()
	if (!text) return fallback
	return text.length > 120 ? text.slice(0, 120) : text
}

export const sanitizeFolder = (value: any) => sanitizeName(value || '试听', '试听')

/** 按桌面版「下载文件名格式」模板生成文件名（不含扩展名） */
export const buildBaseName = (track: any): string => {
	const template = String(getSetting('download.fileName', '歌名 - 歌手') ?? '歌名 - 歌手')
	const title = String(track?.title ?? track?.name ?? '')
	const artist = String(track?.artist ?? track?.singer ?? '')
	const raw = template.replace('歌手', artist).replace('歌名', title)
	return sanitizeName(raw, sanitizeName(title, '未命名'))
}

export const getDownloadDir = (listName?: string) => `${DOWNLOAD_ROOT}${sanitizeFolder(listName)}/`

export const ensureDir = async(dir: string) => {
	try {
		const info: any = await (FileSystem as any).getInfoAsync(dir)
		if (!info?.exists) await (FileSystem as any).makeDirectoryAsync(dir, { intermediates: true })
	} catch (err) {
		logError('[download] ensureDir failed', String((err as any)?.message ?? err))
	}
}

/** 避免同名覆盖：xxx.flac 已存在 → xxx (2).flac */
export const uniquePath = async(dir: string, baseName: string, ext: string): Promise<string> => {
	let index = 1
	let name = `${baseName}${ext}`
	// 上限防止死循环
	while (index < 500) {
		const path = `${dir}${name}`
		const info: any = await (FileSystem as any).getInfoAsync(path)
		if (!info?.exists) return path
		index++
		name = `${baseName} (${index})${ext}`
	}
	return `${dir}${baseName}-${Date.now()}${ext}`
}

export type DownloadMeta = {
	title: string
	artist: string
	album?: string
	year?: string
	duration?: number
	source?: string
	sourceId?: string
	quality?: string
	bitrate?: string
	fileSize?: number
	downloadedAt: number
	listName: string
	cover?: string
	lyric?: string
	translation?: string
}

const sidecarBase = (audioPath: string) => audioPath.replace(/\.(flac|mp3|m4a|wav|aac|ogg)$/i, '')

export const writeSidecar = async(
	audioPath: string,
	meta: DownloadMeta,
	payload: { lyric?: string, translation?: string, coverUri?: string },
) => {
	const base = sidecarBase(audioPath)
	try {
		if (payload.coverUri) {
			const dest = `${base}.jpg`
			await (FileSystem as any).copyAsync({ from: payload.coverUri, to: dest })
			meta.cover = `${dest.split('/').pop()}`
		}
	} catch (err) {
		logError('[download] cover sidecar failed', String((err as any)?.message ?? err))
	}
	try {
		if (payload.lyric) {
			await (FileSystem as any).writeAsStringAsync(`${base}.lrc`, payload.lyric, { encoding: 'utf8' })
			meta.lyric = `${base.split('/').pop()}.lrc`
		}
		if (payload.translation) {
			await (FileSystem as any).writeAsStringAsync(`${base}.tlrc`, payload.translation, { encoding: 'utf8' })
			meta.translation = `${base.split('/').pop()}.tlrc`
		}
	} catch (err) {
		logError('[download] lyric sidecar failed', String((err as any)?.message ?? err))
	}
	try {
		await (FileSystem as any).writeAsStringAsync(`${base}.json`, JSON.stringify(meta, null, 2), { encoding: 'utf8' })
	} catch (err) {
		logError('[download] meta sidecar failed', String((err as any)?.message ?? err))
	}
	logInfo('[download] sidecar written', base.split('/').pop())
}

export type LocalSidecar = {
	meta: DownloadMeta | null
	lyric: string
	translation: string
	coverUri: string
}

const readText = async(uri: string): Promise<string> => {
	try {
		const info: any = await (FileSystem as any).getInfoAsync(uri)
		if (!info?.exists) return ''
		return String(await (FileSystem as any).readAsStringAsync(uri, { encoding: 'utf8' }))
	} catch {
		return ''
	}
}

/** 根据音频路径读取同名 sidecar（封面/歌词/信息） */
export const readSidecar = async(audioPathOrUri: string): Promise<LocalSidecar> => {
	const empty: LocalSidecar = { meta: null, lyric: '', translation: '', coverUri: '' }
	if (!audioPathOrUri) return empty
	// 与播放器统一：裸路径要 percent-encode（文件名含中文/空格）
	const path = audioPathOrUri.startsWith('file://')
		? audioPathOrUri
		: fileUriFromPath(audioPathOrUri)
	if (!/\/downloads\//.test(path)) return empty
	const base = sidecarBase(path)
	const raw = await readText(`${base}.json`)
	let meta: DownloadMeta | null = null
	if (raw) {
		try { meta = JSON.parse(raw) } catch { meta = null }
	}
	const lyric = await readText(`${base}.lrc`)
	const translation = await readText(`${base}.tlrc`)
	const coverInfo: any = await (FileSystem as any).getInfoAsync(`${base}.jpg`).catch(() => null)
	return {
		meta,
		lyric,
		translation,
		coverUri: coverInfo?.exists ? `${base}.jpg` : '',
	}
}

export type DownloadItem = {
	name: string
	uri: string
	size: number
	mtime: number
	folder: string
	meta: DownloadMeta | null
}

/** 递归扫描 downloads/（只到二级：目录/文件） */
export const scanDownloads = async(): Promise<DownloadItem[]> => {
	const out: DownloadItem[] = []
	try {
		const rootInfo: any = await (FileSystem as any).getInfoAsync(DOWNLOAD_ROOT)
		if (!rootInfo?.exists) return out
		const folders = await (FileSystem as any).readDirectoryAsync(DOWNLOAD_ROOT)
		for (const folder of folders ?? []) {
			const dir = `${DOWNLOAD_ROOT}${folder}/`
			const info: any = await (FileSystem as any).getInfoAsync(dir)
			if (!info?.exists || !info.isDirectory) continue
			const files = await (FileSystem as any).readDirectoryAsync(dir)
			for (const file of files ?? []) {
				if (!/\.(flac|mp3|m4a|wav|aac|ogg)$/i.test(file)) continue
				const uri = `${dir}${file}`
				const st: any = await (FileSystem as any).getInfoAsync(uri)
				if (!st?.exists) continue
				const side = await readSidecar(uri)
				out.push({
					name: file,
					uri,
					size: Number(st.size ?? 0),
					mtime: Number(st.modificationTime ?? 0) * 1000 || Date.now(),
					folder,
					meta: side.meta,
				})
			}
		}
	} catch (err) {
		logError('[download] scan failed', String((err as any)?.message ?? err))
	}
	return out.sort((a, b) => b.mtime - a.mtime)
}

/** 删除某个下载（音频 + sidecar） */
export const removeDownload = async(uri: string) => {
	const base = sidecarBase(uri)
	// 注意：base 已经去掉了扩展名，必须把音频扩展名一起列出来。
	// 之前只删 `${base}` + sidecar，等于只删了 .json/.lrc/.jpg，音频本体还在，
	// 列表重新扫描又出现 → 用户看到的就是「点删除没反应」。
	const targets = [
		'.flac', '.mp3', '.m4a', '.wav', '.aac', '.ogg',
		'.json', '.lrc', '.tlrc', '.jpg', '.png',
	]
	let removedAudio = false
	for (const ext of targets) {
		try {
			await (FileSystem as any).deleteAsync(`${base}${ext}`, { idempotent: true })
			if (ext === '.flac' || ext === '.mp3' || ext === '.m4a' || ext === '.wav' || ext === '.aac' || ext === '.ogg') {
				removedAudio = true
			}
		} catch (err) {
			logError('[download] delete failed', `${base}${ext}`, String((err as any)?.message ?? err))
		}
	}
	if (!removedAudio) logError('[download] 未找到要删除的音频文件', uri)
	// 同步剔除下载索引，否则下次播放会命中一个不存在的文件
	try {
		const { removeDownloaded } = await import('./downloadIndex')
		removeDownloaded(uri)
		const { refreshCachedKeys } = await import('./cacheIndexStore')
		await refreshCachedKeys()
	} catch { /* ignore */ }
}

/** 已用空间（downloads/） */
export const getDownloadSize = async(): Promise<{ bytes: number, count: number }> => {
	const items = await scanDownloads()
	return {
		bytes: items.reduce((sum, item) => sum + item.size, 0),
		count: items.length,
	}
}

/** 清理旧版本遗留在 musicCache 里的手动下载（一次性） */
export const purgeLegacyManualDownloads = async() => {
	try {
		const { readCacheIndex, removeCacheIndexEntry } = await import('@/player/CacheManager')
		const idx: any = await readCacheIndex()
		const cacheDir = `${(FileSystem as any).documentDirectory}musicCache/`
		let removed = 0
		for (const [base, entry] of Object.entries<any>(idx ?? {})) {
			if (entry?.manual !== true) continue
			for (const ext of ['', '.flac', '.mp3', '.m4a']) {
				try { await (FileSystem as any).deleteAsync(`${cacheDir}${base}${ext}`, { idempotent: true }) } catch { /* ignore */ }
			}
			await removeCacheIndexEntry(base).catch(() => undefined)
			removed++
		}
		if (removed) logInfo('[download] purged legacy manual downloads', removed)
	} catch { /* ignore */ }
}

export default {
	DOWNLOAD_ROOT, getDownloadDir, ensureDir, buildBaseName, uniquePath,
	writeSidecar, readSidecar, scanDownloads, removeDownload, getDownloadSize,
	purgeLegacyManualDownloads,
}
