/**
 * 手动下载：解析 URL → 落到 Documents/downloads/<歌单名>/（与播放缓存分离），
 * 按「歌名 - 歌手」命名，并写入同名 .json/.lrc/.jpg（歌曲信息/歌词/封面）。
 */
import * as FileSystem from 'expo-file-system/legacy'
import { resolveSource } from '@/player/MusicSourceResolver'
import { getSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'
import { showToast } from '@/utils/utils'
import { upsertTask, removeTask } from '@/jk/downloadTasksStore'

/** 音质归一：把 2000k / hires / flac24bit 等统一成 128k|320k|flac */
export const normalizeQuality = (raw: string, sizeBytes?: number, fileName?: string): string => {
	// 扩展名是硬证据：sidecar 里的 quality 可能是旧版本写错的（实测 4.1MB 被标成 320k）
	const name = String(fileName ?? '').toLowerCase()
	if (/\.(flac|wav)$/.test(name)) return 'flac'
	if (/\.(mp3|m4a|aac|ogg)$/.test(name)) {
		if (sizeBytes) return sizeBytes > 7e6 ? '320k' : '128k'
	}
	const v = String(raw ?? '').toLowerCase()
	if (v === 'flac' || v === '2000k' || v === 'flac24bit' || v === 'hires') return 'flac'
	if (v === '320k') return '320k'
	if (v === '128k' || v === '192k') return '128k'
	if (sizeBytes) return sizeBytes > 15e6 ? 'flac' : sizeBytes > 7e6 ? '320k' : '128k'
	return 'unknown'
}

export const downloadTrack = async(track: any, opts?: { quality?: string, listName?: string }) => {
	// 下载音质与播放音质完全分离：播放用 music.quality，下载用 download.quality
	const requested = String(opts?.quality ?? getSetting('download.quality', '128k'))
	// 连续失败 3 次后停止，避免无限重试
	const prevTask = (await import('@/jk/downloadTasksStore')).downloadTasksStore.getValue()[String(track?.id)]
	if ((prevTask?.attempts ?? 0) >= 3) {
		showToast('提示', '已连续失败 3 次，请稍后再试', 'error')
		logError('[download] stop after 3 failures', String(track?.id))
		return
	}
	try {
		logInfo('[download] start', String(track?.title ?? ''), 'q=' + requested, 'list=' + String(opts?.listName ?? '试听'))
		upsertTask({ id: String(track.id), title: String(track.title ?? ''), percent: 0, status: 'downloading' })
		const forceBad = track?.__forceBad === true || track?.bad === true
		const resolved: any = forceBad
			? { url: 'https://invalid.invalid/x.mp3' }
			: await resolveSource(track, {
				requestType: 'download',
				requestKey: `dl_${Date.now()}`,
				quality: requested as any,
				skipDownload: true,
			} as any)
		if (forceBad) logInfo('[download] forceBad url=', String(resolved?.url ?? ''))
		const url = String(resolved?.url ?? '')
		if (!url) throw new Error('解析未返回可下载地址')
		const actual = normalizeQuality(String((globalThis as any).__jkActualQuality ?? requested))

		const ds = await import('@/jk/downloadStore')
		const dir = ds.getDownloadDir(opts?.listName)
		await ds.ensureDir(dir)
		const extMatch = /\.(flac|mp3|m4a|aac|ogg|wav)(\?|$)/i.exec(url)
		const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : (actual === 'flac' ? '.flac' : '.mp3')
		const baseName = ds.buildBaseName(track)
		const dest = await ds.uniquePath(dir, baseName, ext)

		const limit = Math.max(1, Number(getSetting('download.maxDownloadNum', 3)) || 3)
		const { downloadFile } = await import('@/helpers/fileDownload')
		const { withLimit } = await import('@/jk/limiter')
		await withLimit(limit, async() => {
			await downloadFile(url, dest, (res: any) => {
				const pct = res?.contentLength > 0 ? Math.round((res.bytesWritten / res.contentLength) * 100) : 0
				upsertTask({ id: String(track.id), percent: pct, status: 'downloading' })
				if (pct % 20 === 0) logInfo('[download] progress', String(track.title ?? ''), pct + '%')
			})
		})

		// 完整性校验：拒绝试听片段
		const { readAudioDuration, isTruncatedAudio, parseIntervalSeconds, intervalOf } = await import('@/player/audioDuration')
		const expectedSec = parseIntervalSeconds(intervalOf(track))
		const actualSec = await readAudioDuration(dest)
		if (isTruncatedAudio(actualSec, expectedSec)) {
			try { await (FileSystem as any).deleteAsync(dest, { idempotent: true }) } catch { /* ignore */ }
			throw new Error('下载到的是试听片段')
		}

		// 歌词 / 封面 sidecar
		let lyric = ''
		let translation = ''
		try {
			const { fetchLyric } = await import('@/jk/lyric')
			const lrc = await fetchLyric(track)
			lyric = String(lrc?.lyric ?? '')
			translation = String((lrc as any)?.tlyric ?? '')
		} catch { /* 歌词失败不影响下载 */ }
		let coverTemp = ''
		try {
			const { resolveArtwork } = await import('@/jk/artwork')
			const coverUrl = await resolveArtwork(track)
			if (coverUrl) {
				const { File, Paths } = await import('expo-file-system')
				const target = new File(Paths.cache, `dl-cover-${Date.now()}.jpg`)
				const downloaded = await File.downloadFileAsync(coverUrl, target, { idempotent: true })
				coverTemp = String((downloaded as any)?.uri ?? target.uri)
			}
		} catch { /* 封面失败不影响下载 */ }

		const st: any = await (FileSystem as any).getInfoAsync(dest)
		await ds.writeSidecar(dest, {
			title: String(track?.title ?? ''),
			artist: String(track?.artist ?? ''),
			album: String((track as any)?.album ?? (track as any)?.meta?.albumName ?? ''),
			year: String((track as any)?.year ?? (track as any)?.meta?.year ?? (track as any)?.meta?.publishTime ?? ''),
			duration: Number((track as any)?.duration ?? 0) || undefined,
			source: String((track as any)?.platform ?? ''),
			sourceId: String((track as any)?.id ?? ''),
			quality: actual,
			bitrate: String((globalThis as any).__jkActualQuality ?? actual),
			fileSize: Number(st?.size ?? 0),
			downloadedAt: Date.now(),
			listName: String(opts?.listName ?? '试听'),
		}, { lyric, translation, coverUri: coverTemp })

		logInfo('[download] done', String(track?.title ?? ''), 'q=' + actual, 'path=' + dest.split('/').pop())
		upsertTask({ id: String(track.id), percent: 100, status: 'done' })
		setTimeout(() => removeTask(String(track.id)), 1500)
		showToast('提示', `已下载 ${String(track?.title ?? '')}（${actual}）`, 'success')
	} catch (err) {
		logError('[download] failed', String((err as any)?.message ?? err))
		const prev = (await import('@/jk/downloadTasksStore')).downloadTasksStore.getValue()[String(track?.id)]?.attempts ?? 0
		upsertTask({ id: String(track.id), percent: 0, status: 'failed', error: String((err as any)?.message ?? err), attempts: prev + 1 })
		showToast('错误', '下载失败，可在下载页重试', 'error')
	}
}

export default { downloadTrack }
