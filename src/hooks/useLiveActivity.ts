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
import { currentArtworkStore } from '@/jk/artworkStore'
import { startLiveActivity, updateLiveActivity, endLiveActivity } from '@/jk/liveActivity'
import { logInfo, logError } from '@/helpers/logger'
import { useIsPlaying } from '@rntp/player'

/**
 * 把封面压成 96x96 JPEG 的 base64（约 3-6KB）。
 * Live Activity 是独立进程，读不到主 App 沙盒；直接内嵌数据最稳（断网也有封面）。
 */
const encodeArtwork = async(uri?: string): Promise<string> => {
	const source = String(uri ?? '').trim()
	if (!source) return ''
	try {
		const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator')
		let localUri = source
		if (/^https?:/i.test(source)) {
			const { File, Paths } = await import('expo-file-system')
			const target = new File(Paths.cache, 'live-artwork-src.jpg')
			const downloaded = await File.downloadFileAsync(source, target, { idempotent: true })
			localUri = String((downloaded as any)?.uri ?? target.uri)
		}
		// ActivityAttributes 有 4KB 上限：64x64 / q0.4 约 2KB base64，留足其它字段空间
		const out = await manipulateAsync(localUri, [{ resize: { width: 64 } }], {
			compress: 0.4,
			format: SaveFormat.JPEG,
			base64: true,
		})
		const b64 = String(out?.base64 ?? '')
		if (b64.length > 3000) {
			// 兜底：再压一档，避免 attributes 超限导致整个 Live Activity 启动失败
			const smaller = await manipulateAsync(localUri, [{ resize: { width: 48 } }], {
				compress: 0.35,
				format: SaveFormat.JPEG,
				base64: true,
			})
			return String(smaller?.base64 ?? '')
		}
		return b64
	} catch (err) {
		logError('[live] artwork encode failed', String((err as any)?.message ?? err))
		return ''
	}
}

export const useLiveActivity = () => {
	const current = myTrackPlayer.useCurrentMusic()
	const playing = useIsPlaying() === true
	const { position, duration } = myTrackPlayer.useProgress(2)
	const theme = macThemeStore.useValue()
	// 封面：优先用 artworkSync 异步解析后的地址（本地缓存曲目的 track.artwork 常常是空的）
	const artworkUri = currentArtworkStore.useValue() || String((current as any)?.artwork ?? '')
	const startedIdRef = useRef<string>('')
	const startedArtworkRef = useRef<string>('')
	const attemptedArtworkRef = useRef<string>('')
	// 上一张成功编码的封面：切歌瞬间新封面还没就绪时沿用它，避免灵动岛空白
	const lastArtworkRef = useRef<string>('')

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
		if (startedIdRef.current === id) {
			// 同一首歌：封面后到（artworkSync 异步解析）时补一次 start；
			// 已经尝试过（无论成功失败）就不再重启，避免每 2 秒重建 activity
			if (startedArtworkRef.current || !artworkUri) return
			if (attemptedArtworkRef.current === `${id}:${artworkUri}`) return
		}
		const total = Number(duration ?? 0)
		// 时长还没就绪时先不 start，等 useProgress 拿到 duration 后再触发（effect 依赖 duration）
		if (total <= 0) return
		startedIdRef.current = id
		attemptedArtworkRef.current = `${id}:${artworkUri}`
		const progress = total > 0 ? Number(position ?? 0) / total : 0
		void (async() => {
			const encoded = await encodeArtwork(artworkUri)
			if (encoded) lastArtworkRef.current = encoded
			await startLiveActivity({
				title: String((current as any)?.title ?? ''),
				artist: String((current as any)?.artist ?? ''),
				primaryHex: theme?.primary || '#E240F7',
				duration: total,
				progress,
				isPlaying: !!playing,
				artworkBase64: encoded || lastArtworkRef.current,
			})
			startedArtworkRef.current = encoded || lastArtworkRef.current
			logInfo('[live] start', String((current as any)?.title ?? ''), 'total=', total,
				'art=', startedArtworkRef.current ? 'yes' : 'no')
		})()
	}, [current, duration, position, playing, theme?.primary, artworkUri])

	useEffect(() => {
		if (!startedIdRef.current) return
		const total = Number(duration ?? 0)
		const progress = total > 0 ? Number(position ?? 0) / total : 0
		void updateLiveActivity(progress, !!playing)
	}, [position, duration, playing])

	useEffect(() => () => { void endLiveActivity() }, [])
}

export default useLiveActivity
