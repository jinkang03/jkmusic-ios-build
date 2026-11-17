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
import { LinearGradient } from 'expo-linear-gradient'
import { Animated, Easing, Pressable, Text, View } from 'react-native'
import LyricManager from '@/helpers/lyricManager'
import myTrackPlayer, { nowLyricState } from '@/helpers/trackPlayerIndex'
import { macFont, macPalette } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { useSetting } from '@/jk/settingsStore'
import { nowLxLyricState } from '@/player/PlayerStore'
import { parseKaraokeLine, buildKaraokeMap, findKaraokeSegs } from '@/jk/karaoke'
import { logInfo } from '@/helpers/logger'

const ROW_HEIGHT = 28
const WINDOW = 2

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
		if (!key || key === lastTrackRef.current) return
		lastTrackRef.current = key
		nowLyricState.setValue('')
		nowLxLyricState.setValue('')
	}, [currentTrack?.platform, currentTrack?.id])
	const lyrics: any[] = state?.lyrics ?? []
	const transLyrics: any[] = (showTrans && state?.translationLyrics) ? state.translationLyrics : []

	const currentIndex = useMemo(() => {
		if (typeof current?.index === 'number' && current.index >= 0) return current.index
		// 没有 index 时按时间找最近的一行
		const time = Number(current?.time ?? 0)
		let idx = 0
		for (let i = 0; i < lyrics.length; i++) {
			if (Number(lyrics[i]?.time ?? 0) <= time) idx = i
		}
		return idx
	}, [current, lyrics])

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
	// 逐字：只有当前行订阅 position（0.1s），其它行由 memo 组件隔离
	const { position: karaokePos } = myTrackPlayer.useProgress(0.1)
	const karaokeMs = Math.max(0, Number(karaokePos ?? 0) * 1000)

	// 平滑滚动：index 变化时先让内容偏移 +ROW_HEIGHT，再缓动回 0（视觉上是"上滑一格"）
	const shiftY = React.useRef(new Animated.Value(0)).current
	const prevIdxRef = React.useRef(effectiveIndex)
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
		logInfo(`[lyric] karaoke line=${effectiveIndex} segs=${segs.length} lxLen=${String(lxRaw ?? '').length} pos=${Math.round(karaokeMs)} first=${Math.round(firstStart)} last=${Math.round(lastStart)} lit=${litCount}`)
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

			{/* 上下渐隐 */}
			<LinearGradient
				pointerEvents="none"
				style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, zIndex: 2 }}
				colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
			/>
			<LinearGradient
				pointerEvents="none"
				style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, zIndex: 2 }}
				colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
			/>

			{rows.map((item: any, idx: number) => {
				const absoluteIndex = start + idx
				const distance = Math.abs(absoluteIndex - effectiveIndex)
				const isCurrent = distance === 0
				const opacity = isCurrent ? 1 : distance === 1 ? 0.75 : 0.5
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
							<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
								{karaokeSegs.map((seg, si) => (
									<Text
										key={`k${si}`}
										style={{
											color: karaokeMs >= seg.start ? c.primary : c.textMuted,
											fontSize: zoomActive ? curSize : otherSize,
											fontWeight: zoomActive ? '700' : '400',
										}}
									>
										{seg.text}
									</Text>
								))}
							</View>
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
