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

export const downloadToCache = async (musicItem: IMusic.IMusicItem, onProgress?: (percent: number) => void): Promise<string> => {
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
