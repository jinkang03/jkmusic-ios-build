import { logError, logInfo } from '@/helpers/logger'
import { importedLocalMusicStore, qualityStore } from './PlayerStore'
import PersistStatus from '@/store/PersistStatus'
import * as FileSystem from 'expo-file-system/legacy'
import { downloadFile } from '@/helpers/fileDownload'
import { fileUriFromPath } from '@/helpers/localFile'
import FileSystemNative from '../../modules/cymusic-native'

const cacheDir = FileSystem.documentDirectory + 'musicCache/'
const cacheDirectoryPath = `${FileSystemNative.documentDirectoryPath}/musicCache`

function sanitizeFilename(str: string): string {
	return str.replace(/[/\\?%*:|"<>]/g, '-')
}

export const ensureCacheDirExists = async () => {
	const dirInfo = await FileSystem.getInfoAsync(cacheDir)
	if (!dirInfo.exists) {
		await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true })
	}
}

export const ensureDirExists = async (dirPath: string) => {
	const dirInfo = await FileSystem.getInfoAsync(dirPath)
	if (!dirInfo.exists) {
		await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true })
	}
}

export const getLocalFilePath = (musicItem: IMusic.IMusicItem): string => {
	const format = qualityStore.getValue() === 'flac' ? 'flac' : 'mp3'
	const safeTitle = sanitizeFilename(musicItem.title)
	const safeArtist = sanitizeFilename(musicItem.artist)
	const platformId = musicItem.platform && musicItem.id
		? `${musicItem.platform}_${musicItem.id}`
		: `${safeTitle}-${safeArtist}`
	return `${cacheDir}${platformId}.${format}`
}

// Only accepts paths produced by getLocalFilePath. The filename is raw text,
// while cacheDir is an Expo URI; decoding the whole string would change %/# names.
export const getCacheFileUri = (localPath: string): string =>
	fileUriFromPath(`${cacheDirectoryPath}/${localPath.slice(cacheDir.length)}`)

export const isCached = async (musicItem: IMusic.IMusicItem): Promise<boolean> => {
	const filePath = getLocalFilePath(musicItem)
	const fileInfo = await FileSystem.getInfoAsync(getCacheFileUri(filePath))
	return fileInfo.exists
}

/** 缓存索引：basename → 元数据，让下载页能显示歌名而不是 kw_162152 */
const INDEX_PATH = `${cacheDir}index.json`
type CacheIndexEntry = {
	title?: string, artist?: string, album?: string, quality?: string,
	size?: number, mtime?: number, songmid?: string, source?: string,
	/** true = 用户手动下载；false/undefined = 播放产生的缓存 */
	manual?: boolean,
	/** 这个文件实际由哪个源提供（换源下载时与曲目源不同） */
	actualSource?: string,
	/** 实际提供方的曲目 id（用于换源后按实际源取歌词） */
	actualId?: string
}
type CacheIndex = Record<string, CacheIndexEntry>

let indexQueue: Promise<any> = Promise.resolve()

export const readCacheIndex = async(): Promise<CacheIndex> => {
	try {
		const raw = await FileSystem.readAsStringAsync(INDEX_PATH, { encoding: FileSystem.EncodingType.UTF8 })
		const parsed = JSON.parse(raw)
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch { return {} }
}

const writeCacheIndex = async(index: CacheIndex) => {
	try {
		await FileSystem.writeAsStringAsync(INDEX_PATH, JSON.stringify(index), { encoding: FileSystem.EncodingType.UTF8 })
	} catch (err) { logError('[cache] 写索引失败', String((err as any)?.message ?? err)) }
}

export const upsertCacheIndex = (basename: string, entry: CacheIndexEntry) => {
	indexQueue = indexQueue.then(async() => {
		const index = await readCacheIndex()
		index[basename] = { ...(index[basename] ?? {}), ...entry, mtime: entry.mtime ?? Date.now() }
		await writeCacheIndex(index)
	}).catch(() => undefined)
	return indexQueue
}

export const removeCacheIndexEntry = (basename: string) => {
	indexQueue = indexQueue.then(async() => {
		const index = await readCacheIndex()
		if (index[basename]) { delete index[basename]; await writeCacheIndex(index) }
	}).catch(() => undefined)
	return indexQueue
}

export const downloadToCache = async (
	musicItem: IMusic.IMusicItem,
	onProgress?: (percent: number) => void,
	opts?: { manual?: boolean, quality?: string, actualSource?: string, actualId?: string },
): Promise<string> => {
	try {
		await ensureCacheDirExists()
		const localPath = getLocalFilePath(musicItem)
		// 原子写：先下到 .part，完成后再 rename 成目标文件，
		// 避免播放器读到写了一半的文件（会报 "The operation could not be completed"）
		const finalUri = getCacheFileUri(localPath)
		const partUri = `${finalUri}.part`
		try { await FileSystem.deleteAsync(partUri, { idempotent: true }) } catch { /* ignore */ }
		await downloadFile(musicItem.url, partUri, (res) => {
			const progress = res.bytesWritten / res.contentLength
			if (typeof onProgress === 'function') onProgress(Math.round(progress * 100))
			logInfo(`下载进度: ${(progress * 100).toFixed(2)}%`)
		})
		try { await FileSystem.deleteAsync(finalUri, { idempotent: true }) } catch { /* ignore */ }
		await FileSystem.moveAsync({ from: partUri, to: finalUri })
		// 写索引：供下载页显示歌名
		try {
			const st: any = await FileSystem.getInfoAsync(finalUri)
			void upsertCacheIndex(String(localPath).split('/').pop() ?? '', {
				title: (musicItem as any).title,
				artist: (musicItem as any).artist,
				album: (musicItem as any).album,
				// manual=true 表示用户主动下载；播放产生的缓存是 false
				manual: opts?.manual === true,
				actualSource: String(opts?.actualSource ?? (musicItem as any).platform ?? '') || undefined,
				actualId: String(opts?.actualId ?? (musicItem as any).id ?? '') || undefined,
				quality: String(opts?.quality ?? (globalThis as any).__jkActualQuality ?? '') || 'unknown',
				size: Number(st?.size ?? 0),
				mtime: Date.now(),
				songmid: String((musicItem as any).id ?? ''),
				source: (musicItem as any).platform,
			})
		} catch { /* 索引失败不影响播放 */ }
		logInfo('音频文件已缓存到本地:', localPath)
		return localPath
	} catch (error) {
		logError('下载音频文件时出错:', error)
		throw error
	}
}

/**
 * LRU：缓存总量超过 limitBytes 时，按最近修改时间从旧到新删除，
 * 正在播放的文件（activePath）不删。
 */
export const enforceCacheLimit = async(limitBytes: number, activePath?: string): Promise<number> => {
	try {
		const info: any = await FileSystem.getInfoAsync(cacheDir)
		if (!info?.exists) return 0
		const names: string[] = await FileSystem.readDirectoryAsync(cacheDir)
		const entries: Array<{ uri: string, size: number, mtime: number }> = []
		for (const name of names) {
			const uri = `${cacheDir}${name}`
			try {
				const st: any = await FileSystem.getInfoAsync(uri)
				if (!st?.exists || st.isDirectory) continue
				entries.push({ uri, size: Number(st.size ?? 0), mtime: Number(st.modificationTime ?? 0) })
			} catch { /* 单个文件失败不影响整体 */ }
		}
		let total = entries.reduce((sum, e) => sum + e.size, 0)
		if (total <= limitBytes) return 0
		entries.sort((a, b) => a.mtime - b.mtime)
		let removed = 0
		for (const entry of entries) {
			if (total <= limitBytes) break
			if (activePath && entry.uri.endsWith(activePath.replace(/^.*\//, ''))) continue
			try {
				await FileSystem.deleteAsync(entry.uri, { idempotent: true })
				total -= entry.size
				removed++
			} catch { /* ignore */ }
		}
		logInfo(`[cache] LRU 淘汰 ${removed} 个文件，剩余 ${(total / 1024 / 1024).toFixed(1)}MB`)
		return removed
	} catch (err) {
		logError('[cache] LRU 失败', String((err as any)?.message ?? err))
		return 0
	}
}

/** 当前缓存占用（字节） */
export const getCacheSize = async(): Promise<number> => {
	try {
		const info: any = await FileSystem.getInfoAsync(cacheDir)
		if (!info?.exists) return 0
		const names: string[] = await FileSystem.readDirectoryAsync(cacheDir)
		let total = 0
		for (const name of names) {
			try {
				const st: any = await FileSystem.getInfoAsync(`${cacheDir}${name}`)
				if (st?.exists && !st.isDirectory) total += Number(st.size ?? 0)
			} catch { /* ignore */ }
		}
		return total
	} catch { return 0 }
}

export const clearCache = async () => {
	const dirInfo = await FileSystem.getInfoAsync(cacheDir)
	if (dirInfo.exists) {
		await FileSystem.deleteAsync(cacheDir, { idempotent: true })
		const importedLocalMusic = importedLocalMusicStore.getValue() || []
		const updatedImportedLocalMusic = importedLocalMusic.filter((item: IMusic.IMusicItem) => {
			const url = item.url || ''
			const normalizedUrl = url.replace(/^file:\/\//, '')
			return !normalizedUrl.startsWith(cacheDir)
		})
		importedLocalMusicStore.setValue(updatedImportedLocalMusic)
		PersistStatus.set('music.importedLocalMusic', updatedImportedLocalMusic)
		logInfo('缓存已清理')
	} else {
		logInfo('缓存目录不存在，无需清理')
	}
}

export { cacheDir }
