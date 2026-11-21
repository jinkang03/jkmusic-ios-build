/**
 * 顺序收听预取：起播后把队列里的下一首解析并下载到本地。
 * 切歌命中缓存 → 直接 file:// 起播（本环境 AVPlayer 不加载网络流）。
 * 关键：下一首没有 url，必须先 resolveSource 拿到地址（旧骨架版只判断 next.url 会直接跳过）。
 */
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { isCached, downloadToCache } from './CacheManager'
import { resolveSource } from './MusicSourceResolver'
import { withLimit } from '@/jk/limiter'
import { getSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'

let prefetchGeneration = 0
let running = false

export const bumpPrefetchGeneration = () => { prefetchGeneration++ }

export const prefetchNext = async() => {
	if (running) return
	const tp: any = myTrackPlayer as any
	try {
		const cur: any = tp.getCurrentMusic?.()
		if (!cur) { logInfo('[prefetch] skip no current'); return }
		const list: any[] = tp.getPlayList?.() ?? []
		const idx = list.findIndex((m: any) => String(m.id) === String(cur.id) && String(m.platform) === String(cur.platform))
		if (idx < 0) { logInfo('[prefetch] skip empty（找不到索引） idx=', idx); return }
		const next: any = list[idx + 1]
		if (!next) { logInfo('[prefetch] skip empty（队列末尾） idx=', idx); return }

		if (await isCached(next)) {
			logInfo('[prefetch] hit', String(next.title ?? ''))
			return
		}

		running = true
		const gen = ++prefetchGeneration
		logInfo('[prefetch] start next=', String(next.title ?? ''))
		logInfo('[prefetch] 预取下一首:', String(next.title ?? ''))

		// skipDownload：预取只需要「取流地址」，下面 withLimit 里才真正下载。
		// 不加这个会下载两次（resolveSource 内部一次 + 这里一次），
		// 白白占用带宽并和当前曲的下载互相拖慢
		const resolved: any = await resolveSource(next, {
			requestType: 'prefetch',
			requestKey: `pf_${Date.now()}`,
			skipDownload: true,
		} as any)

		if (gen !== prefetchGeneration) { logInfo('[prefetch] cancelled（解析后世代变化）'); return }
		const url = String(resolved?.url ?? '')
		logInfo('[prefetch] resolve ok url=', url.slice(0, 60), 'empty=', !url)
		if (!url) { logInfo('[prefetch] skip empty（resolve 未给出 url）'); return }

		const limit = Math.max(1, Number(getSetting('download.maxDownloadNum', 3)) || 3)
		await withLimit(limit, async() => {
			logInfo('[prefetch] limit start active=', limit)
			await downloadToCache({ ...next, url } as any)
		})

		if (gen !== prefetchGeneration) { logInfo('[prefetch] cancelled after download'); return }
		logInfo('[prefetch] done path=', String(next.id ?? ''))
	} catch (err) {
		logError('[prefetch] failed', String((err as any)?.message ?? err))
	} finally {
		running = false
	}
}

export default { prefetchNext, bumpPrefetchGeneration }
