/**
 * 手动下载：解析 URL → 落到缓存目录 → 索引标记 manual=true 并记录实际音质。
 * 与播放缓存共用目录（不新建第二套），靠索引的 manual 字段区分。
 */
import { resolveSource } from '@/player/MusicSourceResolver'
import { downloadToCache } from '@/player/CacheManager'
import { withLimit } from '@/jk/limiter'
import { getSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'
import { showToast } from '@/utils/utils'
import { upsertTask, removeTask } from '@/jk/downloadTasksStore'

/** 音质归一：把 2000k / hires / flac24bit 等统一成 128k|320k|flac */
export const normalizeQuality = (raw: string, sizeBytes?: number): string => {
	const v = String(raw ?? '').toLowerCase()
	if (v === 'flac' || v === '2000k' || v === 'flac24bit' || v === 'hires') return 'flac'
	if (v === '320k') return '320k'
	if (v === '128k' || v === '192k') return '128k'
	if (sizeBytes) return sizeBytes > 15e6 ? 'flac' : sizeBytes > 7e6 ? '320k' : '128k'
	return 'unknown'
}

export const downloadTrack = async(track: any) => {
	const requested = String(getSetting('music.quality', '128k'))
	// 连续失败 3 次后停止，避免无限重试
	const prevTask = (await import('@/jk/downloadTasksStore')).downloadTasksStore.getValue()[String(track?.id)]
	if ((prevTask?.attempts ?? 0) >= 3) {
		showToast('提示', '已连续失败 3 次，请稍后再试', 'error')
		logError('[download] stop after 3 failures', String(track?.id))
		return
	}
	try {
		logInfo('[download] start', String(track?.title ?? ''), 'q=' + requested)
		upsertTask({ id: String(track.id), title: String(track.title ?? ''), percent: 0, status: 'downloading' })
		const resolved: any = await resolveSource(track, {
			requestType: 'download',
			requestKey: `dl_${Date.now()}`,
		} as any)
		const url = String(resolved?.url ?? '')
		if (!url) throw new Error('解析未返回可下载地址')
		const actual = normalizeQuality(String((globalThis as any).__jkActualQuality ?? requested))
		const limit = Math.max(1, Number(getSetting('download.maxDownloadNum', 3)) || 3)
		logInfo('[limit] queued limit=', limit, 'activeBefore=', (await import('@/jk/limiter')).getActive())
		await withLimit(limit, () => downloadToCache({ ...track, url } as any, (pct: number) => {
			upsertTask({ id: String(track.id), percent: pct, status: 'downloading' })
			if (pct % 20 === 0) logInfo('[download] progress', String(track.title ?? ''), pct + '%')
		}, { manual: true, quality: actual }))
		logInfo('[limit] done active=', (await import('@/jk/limiter')).getActive())
		logInfo('[download] done', String(track?.title ?? ''), 'q=' + actual)
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
