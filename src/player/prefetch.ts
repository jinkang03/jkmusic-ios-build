/**
 * 顺序收听预取：当前曲起播后 2 秒，解析并下载队列里的下一首。
 * 切歌时命中缓存 → 直接 file:// 起播（本环境流式不可用，这是唯一的加速手段）。
 * 当前曲的下载不进限流（不能被预取拖慢），预取才走 withLimit。
 */
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { isCached, downloadToCache } from './CacheManager'
import { resolveSource } from './MusicSourceResolver'
import { withLimit, getActive } from '@/jk/limiter'
import { getSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'

let generation = 0
let running = false

export const bumpPrefetchGeneration = () => { generation++ }

export const prefetchNext = async() => {
	if (running) return
	const myGen = generation
	const tp: any = myTrackPlayer as any
	try {
		const current: any = tp.getCurrentMusic?.()
		if (!current) { logInfo('[prefetch] skip empty（无当前曲）'); return }
		const list: any[] = tp.getPlayList?.() ?? []
		const idx = list.findIndex((m: any) => String(m.id) === String(current.id) && String(m.platform) === String(current.platform))
		if (idx < 0) { logInfo('[prefetch] skip empty（找不到当前曲索引）'); return }
		const next: any = list[idx + 1]
		if (!next) { logInfo('[prefetch] skip empty（队列末尾）'); return }
		if (String(next.id) === String(current.id)) { logInfo('[prefetch] skip empty（同一首）'); return }

		if (await isCached(next)) { logInfo('[prefetch] hit', String(next.title ?? '')); return }

		running = true
		logInfo('[prefetch] start next=' + String(next.title ?? ''))
		const resolved: any = await resolveSource(next, {
			requestType: 'prefetch',
			requestKey: `pf_${Date.now()}`,
		} as any)
		if (myGen !== generation) { logInfo('[prefetch] cancelled（解析完成时代世已变）'); return }
		if (!resolved?.url) { logInfo('[prefetch] failed（无 url）'); return }
		if (resolved.wasCached) { logInfo('[prefetch] hit（解析发现已缓存）'); return }
		logInfo('[prefetch] resolve ok')

		const limit = Math.max(1, Number(getSetting('download.maxDownloadNum', 3)) || 3)
		logInfo('[prefetch] limit start active=' + getActive())
		await withLimit(limit, () => downloadToCache({ ...next, url: resolved.url } as any))
		if (myGen !== generation) { logInfo('[prefetch] cancelled（下载完成时代世已变）'); return }
		logInfo('[prefetch] done path=' + String(next.id ?? ''))
	} catch (err) {
		logError('[prefetch] failed', String((err as any)?.message ?? err))
	} finally {
		running = false
	}
}

export default { prefetchNext, bumpPrefetchGeneration }
