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
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import LyricManager from '@/helpers/lyricManager'
import myTrackPlayer, { nowLyricState } from '@/helpers/trackPlayerIndex'
import { macFont, macPalette } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { useSetting } from '@/jk/settingsStore'
import { tr } from '@/utils/i18n'
import { nowLxLyricState } from '@/player/PlayerStore'
import { seekPreviewStore } from '@/player/seekPreview'
import { parseKaraokeLine, buildKaraokeMap, findKaraokeSegs, karaokeLineProgress } from '@/jk/karaoke'
import KaraokeFillText from './KaraokeFillText'
import KaraokeSegLine from './KaraokeSegLine'
import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient } from 'expo-linear-gradient'
import { fetchLyric } from '@/jk/lyric'
import { logInfo } from '@/helpers/logger'

const ROW_HEIGHT = 34
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
	const [lyricDelay] = useSetting('lyric.delaySeconds', 0)
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
	const findTrans = (time: any) => {
		if (!transLyrics.length) return undefined
		const t = Number(time ?? 0)
		let best: any = null
		let bestDiff = 0.08
		for (const item of transLyrics) {
			const diff = Math.abs(Number(item?.time ?? 0) - t)
			if (diff <= bestDiff) { best = item; bestDiff = diff }
		}
		return best?.lrc || undefined
	}

	const { position: karaokePos } = myTrackPlayer.useProgress(0.05)
	const seekPreview = seekPreviewStore.useValue()
	// 拖动进度条时：歌词按预览位置走（松手后才真正 seek），避免「拉完对不上」
	// 与 mac 一致：进度统一减去「歌词延迟」再对齐时间轴
	const karaokeMs = Math.max(0, Math.round((Number(seekPreview ?? karaokePos ?? 0) - Number(lyricDelay ?? 0)) * 1000))
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
	const [boxHeight, setBoxHeight] = React.useState(0)


	// 平滑滚动：index 变化时先让内容偏移 +ROW_HEIGHT，再缓动回 0（视觉上是"上滑一格"）
	const shiftY = React.useRef(new Animated.Value(0)).current
	const prevIdxRef = React.useRef(effectiveIndex)
	const renderLogRef = React.useRef('')
	const karaokeLogRef = React.useRef(-1)
	React.useEffect(() => {
		const from = prevIdxRef.current
		if (from === effectiveIndex) return
		prevIdxRef.current = effectiveIndex
		const delta = effectiveIndex - from
		// 逐行切换：把内容先整体下移一行（视觉上还停在上一行），再缓动上滑到中心。
		// 之前只移 0.6 行，会出现「先跳一下再回弹」的顿挫感。
		if (Math.abs(delta) > 1) {
			// seek/跳段不播动画，直接归位
			shiftY.setValue(0)
			return
		}
		shiftY.setValue(delta > 0 ? ROW_HEIGHT : -ROW_HEIGHT)
		Animated.timing(shiftY, {
			toValue: 0,
			duration: 360,
			easing: Easing.bezier(0.22, 1, 0.36, 1),
			useNativeDriver: true,
		}).start()
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

	// 当前行的已唱比例（0..1）：逐字数据优先，没有就按行时间线性推进
	const lineProgress = React.useMemo(() => {
		if (karaokeSegs.length > 0) return karaokeLineProgress(karaokeSegs, karaokeMs)
		const lineTime = Number(lyrics[effectiveIndex]?.time ?? 0) * 1000
		const nextTime = Number(lyrics[effectiveIndex + 1]?.time ?? 0) * 1000
		if (!lineTime) return 0
		const end = nextTime > lineTime ? nextTime : lineTime + 4000
		return Math.min(1, Math.max(0, (karaokeMs - lineTime) / Math.max(1, end - lineTime)))
	}, [karaokeSegs, karaokeMs, lyrics, effectiveIndex])

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
				<Text style={{ textAlign: 'center', color: c.textMuted, fontSize: 12 }}>{tr('暂无歌词', 'No lyrics')}</Text>
			</View>
		)
	}

	// 窗口行数按容器实测高度决定：固定 5 行在小屏上会把首尾行切一半（视觉上是「半截字」）
	const win = Math.max(1, Math.min(3, Math.floor((boxHeight || ROW_HEIGHT * 5) / 2 / ROW_HEIGHT)))
	const windowSize = win * 2 + 1
	const start = effectiveIndex - win
	const rows: Array<any> = []
	for (let i = 0; i < windowSize; i++) rows.push(lyrics[start + i] ?? null)

	return (
		<MaskedView
			style={{ flex: 1 }}
			maskElement={
				<LinearGradient
					colors={['transparent', '#fff', '#fff', 'transparent']}
					locations={[0, 0.2, 0.8, 1]}
					style={StyleSheet.absoluteFill}
				/>
			}
		>
		<View
			style={{ flex: 1, justifyContent: 'center', overflow: 'hidden' }}
			onLayout={({ nativeEvent }) => {
				const h = Math.round(nativeEvent.layout.height)
				if (h > 0 && h !== boxHeight) setBoxHeight(h)
			}}
		>
			<Animated.View style={{ transform: [{ translateY: shiftY }] }}>

			{/* 上下渐隐改为纯透明度（原来是一层黑色遮罩，视觉上像一条黑边） */}

			{rows.map((item: any, idx: number) => {
				const absoluteIndex = start + idx
				const distance = Math.abs(absoluteIndex - effectiveIndex)
				const isCurrent = distance === 0
				// 距离分级：越远越淡（Apple Music 那种纵深感）
				// 上下渐隐：透明度按距离衰减（纯透明度，不叠黑色遮罩）
				const opacity = isCurrent ? 1 : distance === 1 ? 0.62 : distance === 2 ? 0.32 : 0.18
				if (isCurrent && renderLogRef.current !== `${absoluteIndex}:${karaokeSegs.filter(x => karaokeMs >= x.start).length}`) {
					renderLogRef.current = `${absoluteIndex}:${karaokeSegs.filter(x => karaokeMs >= x.start).length}`
					logInfo('[lyric] render row', absoluteIndex, 'isCurrent=', isCurrent,
						'segs=', karaokeSegs.length,
						'lit=', karaokeSegs.filter(x => karaokeMs >= x.start).length,
						'color0=', karaokeSegs[0] ? (karaokeMs >= karaokeSegs[0].start ? 'primary' : 'muted') : 'none')
				}
				if (!item) {
					return <View key={`blank-${absoluteIndex}`} style={{ height: ROW_HEIGHT }} />
				}
				return (
					<Pressable
						key={`${absoluteIndex}-${item?.time ?? idx}`}
						onPress={() => {
							// 能拿到时间就 seek，拿不到就不响应
							const t = Number(item?.time ?? 0)
							if (t > 0) void myTrackPlayer.seekTo(t)
						}}
						style={{
							height: ROW_HEIGHT,
							justifyContent: 'center',
							// 与 mac 一致：离当前行越远越小（缩放不改变布局）
							transform: [{ scale: isCurrent ? 1 : distance === 1 ? 0.97 : 0.94 }],
						}}
					>
						{isCurrent ? (
							<KaraokeSegLine
								text={String(item?.lrc ?? item?.content ?? '')}
								segs={karaokeSegs}
								nowMs={karaokeMs}
								activeColor={c.primary}
								inactiveColor={c.textMuted}
								fallbackProgress={lineProgress}
								textStyle={{
									textAlign: 'center',
									fontSize: zoomActive ? curSize : otherSize,
									fontWeight: zoomActive ? '700' : '400',
								}}
							/>
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
						{isCurrent && findTrans(item?.time) ? (
							// 翻译用绝对定位：行高固定，滚动动画才不会因翻译行忽高忽低而顿挫。
							// 进度与原文同一时间轴 → 逐字时翻译也一起向右推进。
							<View style={{ position: 'absolute', left: 0, right: 0, top: ROW_HEIGHT - 8 }}>
								<KaraokeFillText
									text={String(findTrans(item?.time) ?? '')}
									progress={lineProgress}
									activeColor={c.primary}
									inactiveColor={c.textMuted}
									textStyle={{ textAlign: 'center', fontSize: Math.max(11, curSize - 5) }}
									opacity={0.9}
								/>
							</View>
						) : null}
					</Pressable>
				)
			})}
			</Animated.View>
		</View>
		</MaskedView>
	)
}

export default MiniLyric
