/**
 * 紧凑歌词区（播放详情页中部）。
 *
 * 为什么不复用 components/lyric：那个组件的 ListHeaderComponent 用 paddingTop: '70%'，
 * 百分比 padding 按父容器宽度解析（345pt 宽 ≈ 242pt 空白头部），是全屏歌词的设计，
 * 塞进 ~200pt 的紧凑区会把所有行推到可视区外。
 *
 * 这里只做「当前行 ± 2」五行纯 map 渲染，不用 FlatList，不引入新依赖。
 */
import React, { useMemo } from 'react'
import { Animated, Easing, Pressable, Text, View } from 'react-native'
import LyricManager from '@/helpers/lyricManager'
import myTrackPlayer, { nowLyricState } from '@/helpers/trackPlayerIndex'
import { macFont, macPalette } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { useSetting } from '@/jk/settingsStore'
import { nowLxLyricState } from '@/player/PlayerStore'
import { parseKaraokeLine, buildKaraokeMap, findKaraokeSegs } from '@/jk/karaoke'
import { fetchLyric } from '@/jk/lyric'
import { logInfo } from '@/helpers/logger'

const ROW_HEIGHT = 28
const WINDOW = 2
// 模块级：跨挂载保持，避免导航回来的重挂载被误判成「切歌」
let lastLyricKey = ''
let lastLxRefetchAt = 0

const MiniLyric = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const state: any = LyricManager.useLyricState()
	const current: any = LyricManager.useCurrentLyric()
	const raw: string = nowLyricState.useValue() as any
	const [zoomActive] = useSetting('playDetail.isZoomActiveLrc', true)
	const [delayScroll] = useSetting('playDetail.isDelayScroll', false)
	const [fontSizeKey] = useSetting('lyric.detailFontSize', 1)
	const [showTrans] = useSetting('player.isShowLyricTranslation', false)
	// 字号档位：当前行 [16,18,20,22]，其它行 [13,15,16,18]
	const curSize = [16, 18, 20, 22][Number(fontSizeKey)] ?? 16
	const otherSize = [13, 15, 16, 18][Number(fontSizeKey)] ?? 13
	// 切歌时清掉上一首的歌词：否则新曲还在加载中会显示「上一首」的歌词（实测出现过串台）
	const currentTrack: any = myTrackPlayer.useCurrentMusic()
	const lastTrackRef = React.useRef<string>('')
	React.useEffect(() => {
		const key = `${currentTrack?.platform ?? ''}:${currentTrack?.id ?? ''}`
		if (!key || key === lastLyricKey) return
		lastLyricKey = key
		nowLyricState.setValue('')
		nowLxLyricState.setValue('')
	}, [currentTrack?.platform, currentTrack?.id])
	const lyrics: any[] = state?.lyrics ?? []
	const transLyrics: any[] = (showTrans && state?.translationLyrics) ? state.translationLyrics : []

	const { position: karaokePos } = myTrackPlayer.useProgress(0.1)
	const karaokeMs = Math.max(0, Math.round(Number(karaokePos ?? 0) * 1000))
	// 当前行改由「播放位置」计算：LyricManager 的 index 依赖 progress 事件，
	// 暂停/seek 后会冻结在旧值（P127 实测：seek 到 14s 仍停在 line=0）。
	const currentIndex = useMemo(() => {
		let lo = 0
		let hi = lyrics.length - 1
		let idx = 0
		while (lo <= hi) {
			const mid = (lo + hi) >> 1
			if (Number(lyrics[mid]?.time ?? 0) * 1000 <= karaokeMs) { idx = mid; lo = mid + 1 }
			else hi = mid - 1
		}
		return idx
	}, [lyrics, karaokeMs])

	React.useEffect(() => {
		if (raw) LyricManager.requestRefresh()
	}, [raw])

	// 延迟跟随：delayScroll=true 时索引变化后 400ms 才切换窗口
	const [followIndex, setFollowIndex] = React.useState(0)
	React.useEffect(() => {
		if (!delayScroll) { setFollowIndex(currentIndex); return }
		const timer = setTimeout(() => {
			setFollowIndex(currentIndex)
			logInfo(`[minilyric] follow index=${currentIndex} delay=400ms`)
		}, 400)
		return () => clearTimeout(timer)
	}, [currentIndex, delayScroll])

	const effectiveIndex = delayScroll ? followIndex : currentIndex


	// 平滑滚动：index 变化时先让内容偏移 +ROW_HEIGHT，再缓动回 0（视觉上是"上滑一格"）
	const shiftY = React.useRef(new Animated.Value(0)).current
	const prevIdxRef = React.useRef(effectiveIndex)
	const renderLogRef = React.useRef('')
	const karaokeLogRef = React.useRef(-1)
	React.useEffect(() => {
		const from = prevIdxRef.current
		if (from === effectiveIndex) return
		prevIdxRef.current = effectiveIndex
		shiftY.setValue(ROW_HEIGHT)
		Animated.timing(shiftY, {
			toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true,
		}).start()
		logInfo(`[minilyric] animate from=${from} to=${effectiveIndex} dur=280`)
	}, [effectiveIndex, shiftY])

	// 逐字：从 lxlyric 原文建「行时间 → 分段」映射，再按当前行时间取（±30ms 容错）
	const lxRaw = nowLxLyricState.useValue()
	// 自愈：lxlyric 被清空时补拉一次（30 秒节流，避免失败循环）
	const lyricWatch = nowLyricState.useValue()
	React.useEffect(() => {
		if (!currentTrack) return
		if (lxRaw && lxRaw.length > 100) return
		if (!lyricWatch || String(lyricWatch).length < 20) return
		const now = Date.now()
		if (now - lastLxRefetchAt < 30000) return
		lastLxRefetchAt = now
		logInfo('[lyric] lx missing, refetch')
		void fetchLyric(currentTrack as any)
			.then((res: any) => {
				if (res?.lxlyric) {
					nowLxLyricState.setValue(res.lxlyric)
					logInfo('[lyric] lx refilled len=' + String(res.lxlyric).length)
				}
			})
			.catch(() => {})
	}, [lxRaw, lyricWatch, currentTrack?.id])
	const karaokeMap = React.useMemo(() => buildKaraokeMap(lxRaw), [lxRaw])
	const karaokeSegs = React.useMemo(
		() => findKaraokeSegs(karaokeMap, Number(lyrics[effectiveIndex]?.time ?? 0) * 1000),
		[karaokeMap, lyrics, effectiveIndex],
	)

	// 逐字诊断：仅在当前行变化时打一行（pos 变化不打）
	const curLine: any = lyrics[effectiveIndex]
	React.useEffect(() => {
		if (karaokeLogRef.current === effectiveIndex) return
		karaokeLogRef.current = effectiveIndex
		const segs = findKaraokeSegs(karaokeMap, Number(curLine?.time ?? 0) * 1000)
		const firstStart = segs[0]?.start ?? -1
		const lastStart = segs[segs.length - 1]?.start ?? -1
		const litCount = segs.filter(x => karaokeMs >= x.start).length
		logInfo(`[lyric] active idx=${effectiveIndex} pos=${Math.round(karaokeMs)} segs=${segs.length} lit=${litCount} lxLen=${String(lxRaw ?? '').length} first=${Math.round(firstStart)} last=${Math.round(lastStart)}`)
	}, [effectiveIndex, curLine, karaokeMs, karaokeMap, lxRaw])


	if (!lyrics.length) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
				<Text style={{ textAlign: 'center', color: c.textMuted, fontSize: 12 }}>暂无歌词</Text>
			</View>
		)
	}

	const start = Math.max(0, effectiveIndex - WINDOW)
	const end = Math.min(lyrics.length, effectiveIndex + WINDOW + 1)
	const rows = lyrics.slice(start, end)

	return (
		<View style={{ flex: 1, justifyContent: 'center', overflow: 'hidden' }}>
			<Animated.View style={{ transform: [{ translateY: shiftY }] }}>

			{/* 上下渐隐改为纯透明度（原来是一层黑色遮罩，视觉上像一条黑边） */}

			{rows.map((item: any, idx: number) => {
				const absoluteIndex = start + idx
				const distance = Math.abs(absoluteIndex - effectiveIndex)
				const isCurrent = distance === 0
				const opacity = isCurrent ? 1 : distance === 1 ? 0.75 : 0.5
				if (isCurrent && renderLogRef.current !== `${absoluteIndex}:${karaokeSegs.filter(x => karaokeMs >= x.start).length}`) {
					renderLogRef.current = `${absoluteIndex}:${karaokeSegs.filter(x => karaokeMs >= x.start).length}`
					logInfo('[lyric] render row', absoluteIndex, 'isCurrent=', isCurrent,
						'segs=', karaokeSegs.length,
						'lit=', karaokeSegs.filter(x => karaokeMs >= x.start).length,
						'color0=', karaokeSegs[0] ? (karaokeMs >= karaokeSegs[0].start ? 'primary' : 'muted') : 'none')
				}
				return (
					<Pressable
						key={`${absoluteIndex}-${item?.time ?? idx}`}
						onPress={() => {
							// 能拿到时间就 seek，拿不到就不响应
							const t = Number(item?.time ?? 0)
							if (t > 0) void myTrackPlayer.seekTo(t)
						}}
						style={{ height: ROW_HEIGHT, justifyContent: 'center' }}
					>
						{isCurrent && karaokeSegs.length > 0 ? (
							<Text
								style={{
									textAlign: 'center',
									fontSize: zoomActive ? curSize : otherSize,
									fontWeight: zoomActive ? '700' : '400',
								}}
							>
								{karaokeSegs.map((seg, si) => (
									<Text key={`k${si}`} style={{ color: karaokeMs >= seg.start ? c.primary : c.textMuted }}>
										{seg.text}
									</Text>
								))}
							</Text>
						) : (
							<Text
								numberOfLines={1}
								style={{
									textAlign: 'center',
									color: isCurrent ? c.primary : c.textMuted,
									fontSize: (isCurrent && zoomActive) ? curSize : otherSize,
									fontWeight: (isCurrent && zoomActive) ? '700' : '400',
									opacity,
								}}
							>
								{item?.lrc ?? item?.content ?? ''}
							</Text>
						)}
						{isCurrent && transLyrics[absoluteIndex] ? (
							<Text numberOfLines={1} style={{ textAlign: 'center', color: c.textMuted, fontSize: Math.max(11, curSize - 4), marginTop: 2 }}>
								{transLyrics[absoluteIndex]?.lrc ?? ''}
							</Text>
						) : null}
					</Pressable>
				)
			})}
			</Animated.View>
		</View>
	)
}

export default MiniLyric
