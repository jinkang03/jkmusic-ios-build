/**
 * 重新发布 iOS「正在播放」（控制中心 / 锁屏系统控件）。
 *
 * 场景：另一个 App（抖音等）抢走音频后，系统的 now playing 会切到它；
 * 回到我们 App 或中断结束时必须重新 publish，否则控制中心会停在「未在播放」。
 */
import { TurboModuleRegistry } from 'react-native'

export const refreshNowPlaying = () => {
	try {
		const mod = TurboModuleRegistry.get('TrackPlayer') as any
		if (typeof mod?.refreshNowPlaying === 'function') mod.refreshNowPlaying()
	} catch { /* 不影响播放 */ }
}

export default { refreshNowPlaying }
