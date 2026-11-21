/**
 * 进度条拖动中的「预览位置」（秒）。
 * 松手前音频不会 seek，但歌词应该跟着拖动实时走，否则用户会觉得「拉完歌词对不上」。
 */
import { GlobalState } from '@/utils/stateMapper'

export const seekPreviewStore = new GlobalState<number | null>(null)

export const setSeekPreview = (seconds: number | null) => {
	seekPreviewStore.setValue(seconds)
}

/**
 * 带预览位置的 seek。
 *
 * 为什么需要它：`seekTo()` 返回只代表「原生层接受了 seek 请求」，
 * `useProgress` 的 position 还要过几百毫秒才追上。如果这时立刻清空 preview，
 * `karaokeMs` 会回退到旧 position，歌词先跳回旧行、再在几秒后追上，
 * 用户看到的就是「拖完歌词卡几秒然后偏移」（偏移量随 position 上报延迟变化）。
 *
 * 做法：seek 期间一直保持 preview = 目标秒数，轮询到 position 追上再清空。
 */
export const seekWithPreview = async(seconds: number) => {
	const target = Math.max(0, Number(seconds) || 0)
	setSeekPreview(target)
	try {
		const { default: tp } = await import('@/helpers/trackPlayerIndex')
		await Promise.resolve((tp as any).seekTo?.(target))
		// 最多等 4 秒让原生 position 追上目标（暂停状态下 seek 上报更慢）
		for (let i = 0; i < 40; i++) {
			await new Promise(resolve => setTimeout(resolve, 100))
			const pos = Number((tp as any).getProgress?.()?.position ?? 0)
			if (Math.abs(pos - target) < 0.6) break
		}
		// getProgress 读的是原生值，而歌词用的是 useProgress 的 state；
		// 两者有几帧差，清空前留一点宽限，避免清空瞬间跳回旧行
		await new Promise(resolve => setTimeout(resolve, 350))
		try {
			const { logInfo } = await import('@/helpers/logger')
			const finalPos = Number((tp as any).getProgress?.()?.position ?? 0)
			logInfo('[seek] target=', target.toFixed(2), 'pos=', finalPos.toFixed(2), 'delta=', Math.abs(finalPos - target).toFixed(2))
		} catch { /* ignore */ }
	} catch { /* ignore */ }
	setSeekPreview(null)
}

export default seekPreviewStore
