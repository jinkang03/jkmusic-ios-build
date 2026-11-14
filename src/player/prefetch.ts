/**
 * 顺序收听预取：当前曲起播后，后台把队列里的下一首下载到本地，
 * 切歌时命中缓存 → 立即 file:// 起播（本环境流式不可用，只能这样藏延迟）。
 * 与手动下载共用 CacheManager 的原子写，不占用 downloadGeneration 语义。
 */
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { isCached, downloadToCache } from './CacheManager'
import { logError, logInfo } from '@/helpers/logger'
import { withLimit, getActive } from '@/jk/limiter'
import { getSetting } from '@/jk/settingsStore'

let prefetching = false
let lastPrefetchedKey = ''

export const prefetchNext = async() => {
	if (prefetching) return
	try {
		const list: any[] = (myTrackPlayer as any).getPlayList?.() ?? []
		if (!list.length) return
		const current: any = (myTrackPlayer as any).getCurrentMusic?.()
		if (!current) return
		const idx = list.findIndex((m: any) => String(m.id) === String(current.id) && String(m.platform) === String(current.platform))
		if (idx < 0) return
		const next: any = list[idx + 1]
		if (!next) return
		const key = `${next.platform}:${next.id}`
		if (key === lastPrefetchedKey) return
		if (await isCached(next)) { lastPrefetchedKey = key; return }

		prefetching = true
		lastPrefetchedKey = key
		logInfo('[prefetch] 预取下一首:', next.title)
		// 需要有 url 才能下载；没有就跳过（切歌时再按正常流程解析）
		if (next.url && next.url !== 'Unknown') {
			const limit = Math.max(1, Number(getSetting('download.maxDownloadNum', 3)) || 3)
			logInfo(`[limit] start limit=${limit} active=${getActive()}`)
			await withLimit(limit, () => downloadToCache(next))
				.catch(err => logError('[prefetch] 失败', String((err as any)?.message ?? err)))
			logInfo(`[limit] done active=${getActive()}`)
			logInfo('[prefetch] 完成:', next.title)
		}
	} catch (err) {
		logError('[prefetch] 异常', String((err as any)?.message ?? err))
	} finally {
		prefetching = false
	}
}

export default { prefetchNext }
