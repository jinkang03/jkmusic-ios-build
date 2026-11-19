/**
 * 灵动岛 / 锁屏实时活动同步：
 * - 切歌 → start
 * - 播放进度（2 秒粒度）→ update
 * - 无当前曲目 → end
 * 全部是旁路调用，失败不影响播放。
 */
import { useEffect, useRef } from 'react'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { macThemeStore } from '@/jk/themeStore'
import { startLiveActivity, updateLiveActivity, endLiveActivity } from '@/jk/liveActivity'
import { logInfo } from '@/helpers/logger'
import { useIsPlaying } from '@rntp/player'

export const useLiveActivity = () => {
	const current = myTrackPlayer.useCurrentMusic()
	const playing = useIsPlaying() === true
	const { position, duration } = myTrackPlayer.useProgress(2)
	const theme = macThemeStore.useValue()
	const startedIdRef = useRef<string>('')

	useEffect(() => {
		const id = String((current as any)?.id ?? '')
		if (!id) {
			if (startedIdRef.current) {
				startedIdRef.current = ''
				void endLiveActivity()
				logInfo('[live] end (no track)')
			}
			return
		}
		if (startedIdRef.current === id) return
		const total = Number(duration ?? 0)
		// 时长还没就绪时先不 start，等 useProgress 拿到 duration 后再触发（effect 依赖 duration）
		if (total <= 0) return
		startedIdRef.current = id
		const progress = total > 0 ? Number(position ?? 0) / total : 0
		void startLiveActivity({
			title: String((current as any)?.title ?? ''),
			artist: String((current as any)?.artist ?? ''),
			primaryHex: theme?.primary || '#E240F7',
			duration: total,
			progress,
			isPlaying: !!playing,
		})
		logInfo('[live] start', String((current as any)?.title ?? ''), 'total=', total)
	}, [current, duration, position, playing, theme?.primary])

	useEffect(() => {
		if (!startedIdRef.current) return
		const total = Number(duration ?? 0)
		const progress = total > 0 ? Number(position ?? 0) / total : 0
		void updateLiveActivity(progress, !!playing)
	}, [position, duration, playing])

	useEffect(() => () => { void endLiveActivity() }, [])
}

export default useLiveActivity
