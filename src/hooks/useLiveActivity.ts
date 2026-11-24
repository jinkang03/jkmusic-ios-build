/* eslint-disable @typescript-eslint/no-require-imports -- Metro 静态资源必须用 require() */
/**
 * 灵动岛 / 锁屏实时活动同步：
 * - 切歌 → start（封面固定用 App 图标）
 * - 播放进度（2 秒粒度）→ update
 * - 无当前曲目 → end
 * 全部是旁路调用，失败不影响播放。
 */
import { useEffect, useRef } from 'react'
import { Asset } from 'expo-asset'

import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { macThemeStore } from '@/jk/themeStore'
import { startLiveActivity, updateLiveActivity, endLiveActivity } from '@/jk/liveActivity'
import { logInfo, logError } from '@/helpers/logger'
import { useIsPlaying } from '@rntp/player'

/**
 * 把 App 图标压成 64x64 JPEG 的 base64（约 2KB），进程内缓存。
 * Live Activity 是独立进程，读不到主 App 沙盒；直接内嵌数据最稳。
 */
let appIconBase64: string | null = null
const encodeAppIcon = async(): Promise<string> => {
	if (appIconBase64 !== null) return appIconBase64
	try {
		const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator')
		const asset = Asset.fromModule(require('../../assets/jk-app-icon.png'))
		await asset.downloadAsync()
		const uri = asset.localUri ?? asset.uri
		const out = await manipulateAsync(uri, [{ resize: { width: 64 } }], {
			compress: 0.5,
			format: SaveFormat.JPEG,
			base64: true,
		})
		appIconBase64 = String(out?.base64 ?? '')
	} catch (err) {
		logError('[live] app icon encode failed', String((err as any)?.message ?? err))
		appIconBase64 = ''
	}
	return appIconBase64 ?? ''
}

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
		void (async() => {
			const icon = await encodeAppIcon()
			await startLiveActivity({
				title: String((current as any)?.title ?? ''),
				artist: String((current as any)?.artist ?? ''),
				primaryHex: theme?.primary || '#E240F7',
				duration: total,
				progress,
				isPlaying: !!playing,
				// 封面固定用 App 图标（不再塞歌曲封面）
				artworkBase64: icon,
			})
			logInfo('[live] start', String((current as any)?.title ?? ''), 'total=', total,
				'icon=', icon ? 'yes' : 'no')
		})()
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
