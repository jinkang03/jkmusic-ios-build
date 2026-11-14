/**
 * 最小播放路径（实验用）：完全绕开我们的队列/占位项/extras，
 * 只用最少的字段直接调 RNTP，用来判定「桥接层是否工作」。
 */
import TrackPlayer from '@rntp/player'
import { logInfo } from '@/helpers/logger'

export async function playPlain(url: string, title = 'plain test') {
	const tp: any = TrackPlayer as any
	// 1) 彻底清空，避免残留队列干扰
	try { await tp.reset?.() } catch (err) { logInfo('[plain] reset failed', String((err as any)?.message ?? err)) }

	// 2) 最小 mediaItem：只有 mediaId / url / title
	const item = { mediaId: `plain:${Date.now()}`, url, title }
	logInfo('[plain] before queue =', JSON.stringify(tp.getQueue?.()?.length ?? 'n/a'))

	tp.setMediaItems([item] as any, 0)
	logInfo('[plain] after queue =', JSON.stringify(tp.getQueue?.()?.length ?? 'n/a'),
		'active =', JSON.stringify(tp.getActiveMediaItem?.() ?? null).slice(0, 200),
		'state =', String(tp.getPlaybackState?.()))

	await tp.play()
	await new Promise(r => setTimeout(r, 3000))
	logInfo('[plain] progress =', JSON.stringify(tp.getProgress?.() ?? null))
}
