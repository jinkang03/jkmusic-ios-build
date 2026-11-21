import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import type { FlatList as NativeFlatList, FlatListProps } from 'react-native'

import { ThemeColors } from '@/constants/tokens'
import LyricManager from '@/helpers/lyricManager'
import { nowLxLyricState } from '@/player/PlayerStore'
import { seekPreviewStore } from '@/player/seekPreview'
import { buildKaraokeMap, findKaraokeSegs } from '@/jk/karaoke'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useThemeColors } from '@/hooks/useAppTheme'
import useDelayFalsy from '@/hooks/useDelayFalsy'
import PersistStatus from '@/store/PersistStatus'
import { useSetting } from '@/jk/settingsStore'
import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient } from 'expo-linear-gradient'
import { tr } from '@/utils/i18n'
import { logInfo } from '@/helpers/logger'
import delay from '@/utils/delay'
import { useIsPlaying } from '@rntp/player'
import { FlatList } from 'react-native-gesture-handler'
import rpx from '../../utils/rpx'
import LyricItemComponent from './lyricItem'
/** 翻译行按时间匹配：直接按 index 会因「作词/作曲」这类无翻译行而整体错位 */
const findTranslation = (list: any[] | undefined, time: any): string | undefined => {
	if (!list?.length) return
	const t = Number(time ?? 0)
	let best: any = null
	let bestDiff = 0.08
	for (const item of list) {
		const diff = Math.abs(Number(item?.time ?? 0) - t)
		if (diff <= bestDiff) { best = item; bestDiff = diff }
	}
	return best?.lrc || undefined
}

const LyricFlatList = FlatList as React.ForwardRefExoticComponent<
	FlatListProps<ILyric.IParsedLrcItem> & React.RefAttributes<NativeFlatList<ILyric.IParsedLrcItem>>
>
const ITEM_HEIGHT = rpx(92)

interface IItemHeights {
	blankHeight?: number
	[k: number]: number
}

interface IProps {
	onTurnPageClick?: () => void
	/** 是否允许滚动（跟手转场未完成时禁用，避免抢手势） */
	scrollEnabled?: boolean
	/** 在列表顶部继续下拉时回调（用于收起全屏歌词） */
	onRequestClose?: () => void
}

const fontSizeMap = {
	0: rpx(24),
	1: rpx(30),
	2: rpx(36),
	3: rpx(42),
} as Record<number, number>

export default function Lyric(props: IProps) {
	const { scrollEnabled = true, onRequestClose } = props
	const colors = useThemeColors()
	const styles = useMemo(() => createStyles(colors), [colors])
	// const lrcSource = {
	// 	rawLrc: nowLyricState.useValue() || '[00:00.00]暂无歌词',
	// } as ILyric.ILyricSource
	// const musicItem = myTrackPlayer.getCurrentMusic()
	// const parser = new LyricParser(lrcSource, musicItem, {})
	// const lyrics = parser.getLyric()
	// console.log('lyrics', lyrics)
	const [loading] = useState(false)
	const { meta, lyrics, translationLyrics } = LyricManager.useLyricState()
	const [showTrans] = useSetting('player.isShowLyricTranslation', false)
	React.useEffect(() => {
		logInfo('[lyric] translation debug', 'showTrans=', String(showTrans),
			'hasT=', String(!!translationLyrics), 'len=', String((translationLyrics as any)?.length ?? 0),
			'sample=', JSON.stringify((translationLyrics as any)?.[1] ?? null))
	}, [showTrans, translationLyrics])
	// console.log('lyrics', lyrics)
	const currentLrcItem = LyricManager.useCurrentLyric()
	// 逐字歌词：全屏视图复用 MiniLyric 的 lxlyric 解析（之前只有紧凑视图支持）
	const lxRaw = nowLxLyricState.useValue()
	const karaokeMap = useMemo(() => buildKaraokeMap(lxRaw), [lxRaw])
	const { position } = myTrackPlayer.useProgress(0.05)
	const seekPreview = seekPreviewStore.useValue()
	const [lyricDelay] = useSetting('lyric.delaySeconds', 0)
	// 与 mac 一致：统一减去歌词延迟
	const karaokeMs = Math.max(0, (Number(seekPreview ?? position ?? 0) - Number(lyricDelay ?? 0)) * 1000)
	// 当前行按播放位置二分查找：LyricManager 的 index 依赖 progress 事件，
	// 暂停/seek 后会滞后，表现为「歌词不滚动 / 逐字不亮」。
	const activeIndex = useMemo(() => {
		if (!lyrics.length) return -1
		let lo = 0
		let hi = lyrics.length - 1
		let idx = 0
		while (lo <= hi) {
			const mid = (lo + hi) >> 1
			if (Number((lyrics[mid] as any)?.time ?? 0) * 1000 <= karaokeMs) { idx = mid; lo = mid + 1 }
			else hi = mid - 1
		}
		return idx
	}, [lyrics, karaokeMs])
	// const showTranslation = PersistStatus.useValue('lyric.showTranslation', false)
	const fontSizeKey = PersistStatus.useValue('lyric.detailFontSize', 1)
	const fontSizeStyle = useMemo(
		() => ({
			fontSize: fontSizeMap[fontSizeKey!],
		}),
		[fontSizeKey],
	)

	const [draggingIndex, setDraggingIndex] = useDelayFalsy<number | undefined>(undefined, 2000)
	const playing = useIsPlaying()

	const listRef = useRef<NativeFlatList<ILyric.IParsedLrcItem> | null>(null)

	// 是否展示拖拽
	const dragShownRef = useRef(false)

	// 用来缓存高度
	const itemHeightsRef = useRef<IItemHeights>({})
	const lastAutoScrollAtRef = useRef(0)
	const lastAutoScrollIndexRef = useRef(-1)

	// 设置空白组件，获取组件高度
	const blankComponent = useMemo(() => {
		return (
			<View
				style={styles.empty}
				onLayout={(evt) => {
					itemHeightsRef.current.blankHeight = evt.nativeEvent.layout.height
				}}
			/>
		)
	}, [])

	const handleLyricItemLayout = useCallback((index: number, height: number) => {
		itemHeightsRef.current[index] = height
	}, [])

	const clampLyricIndex = useCallback((index: number, listLength: number) => {
		if (listLength <= 0) {
			return 0
		}
		return Math.min(Math.max(index, 0), listLength - 1)
	}, [])

	const scrollToLyricIndex = useCallback(
		(index: number, listLength: number, force = false) => {
			if (!listRef.current || listLength <= 0) {
				return
			}
			if (!scrollEnabled) return
			const targetIndex = clampLyricIndex(index, listLength)
			const now = Date.now()
			// 只挡「同一行重复调用」，其余一律滚动：mac 端的连贯感来自逐行平滑滚动
			if (!force && targetIndex === lastAutoScrollIndexRef.current) {
				return
			}
			if (!force && now - lastAutoScrollAtRef.current < 120) {
				return
			}

			listRef.current.scrollToIndex({
				index: targetIndex,
				viewPosition: 0.5,
				animated: true,
			})
			lastAutoScrollAtRef.current = now
			lastAutoScrollIndexRef.current = targetIndex
		},
		[clampLyricIndex, scrollEnabled],
	)

	// 滚到当前行（按播放位置算出来的行，而不是滞后的 progress 事件）
	const scrollToCurrentLrcItem = useCallback(() => {
		const lyricState = LyricManager.getLyricState()
		const lyricItems = lyricState.lyrics
		if (lyricItems.length === 0) {
			return
		}
		const targetIndex = activeIndex < 0 ? 0 : activeIndex
		scrollToLyricIndex(targetIndex, lyricItems.length, true)
	}, [scrollToLyricIndex, activeIndex])

	// const delayedScrollToCurrentLrcItem = useMemo(() => {
	// 	let sto: number

	// 	return () => {
	// 		if (sto) {
	// 			clearTimeout(sto)
	// 		}
	// 		sto = setTimeout(() => {
	// 			if (isMountedRef.current) {
	// 				scrollToCurrentLrcItem()
	// 			}
	// 		}, 200) as any
	// 	}
	// }, [])

	useEffect(() => {
		// 暂停且拖拽才返回
		if (
			lyrics.length === 0 ||
			draggingIndex !== undefined ||
			lyrics[lyrics.length - 1].time < 1
		) {
			return
		}
		const targetIndex = activeIndex < 0 ? 0 : activeIndex
		scrollToLyricIndex(targetIndex, lyrics.length)
	}, [activeIndex, lyrics.length, draggingIndex, playing, scrollToLyricIndex])

	useEffect(() => {
		scrollToCurrentLrcItem()
	}, [scrollToCurrentLrcItem])

	// 歌词数据晚于组件挂载到位（lines 从 1 → 69）时，补滚一次到当前行。
	// 否则进全屏后会停在第一行（暂停状态下自动滚动被跳过）。
	useEffect(() => {
		if (lyrics.length <= 1) return
		const t = setTimeout(() => scrollToCurrentLrcItem(), 120)
		return () => clearTimeout(t)
	}, [lyrics.length, scrollToCurrentLrcItem])

	// 跟手转场完成后（scrollEnabled 变为 true）补一次定位，否则会停在顶部
	useEffect(() => {
		if (!scrollEnabled) return
		const t = setTimeout(() => scrollToCurrentLrcItem(), 160)
		return () => clearTimeout(t)
	}, [scrollEnabled, scrollToCurrentLrcItem])

	const getItemLayout = useCallback((_: unknown, index: number) => {
		const itemHeights = itemHeightsRef.current
		const headerHeight = itemHeights.blankHeight ?? 0
		let offset = headerHeight
		for (let i = 0; i < index; i++) {
			offset += itemHeights[i] ?? ITEM_HEIGHT
		}
		const length = itemHeights[index] ?? ITEM_HEIGHT
		return {
			length,
			offset,
			index,
		}
	}, [])

	const scrollOffsetRef = useRef(0)
	const onScrollBeginDrag = useCallback(() => {
		dragShownRef.current = true
	}, [])

	const onScrollEndDrag = useCallback(async () => {
		if (draggingIndex !== undefined) {
			setDraggingIndex(undefined)
		}
		dragShownRef.current = false
	}, [draggingIndex, setDraggingIndex])

	const onScroll = useCallback((e: any) => {
		if (dragShownRef.current) {
			const offset = e.nativeEvent.contentOffset.y + e.nativeEvent.layoutMeasurement.height / 2

			const itemHeights = itemHeightsRef.current
			let height = itemHeights.blankHeight!
			if (offset <= height) {
				setDraggingIndex(0)
				return
			}
			for (let i = 0; i < lyrics.length; ++i) {
				height += itemHeights[i] ?? 0
				if (height > offset) {
					setDraggingIndex(i)
					return
				}
			}
		}
	}, [lyrics.length, setDraggingIndex])

	const handleLyricItemPress = useCallback(
		async (index: number) => {
			if (index >= 0 && index < lyrics.length) {
				const time = lyrics[index].time + +(meta?.offset ?? 0)
				if (time !== undefined && !isNaN(time)) {
					myTrackPlayer.seekTo(time)
					await myTrackPlayer.play()
				}
			}
		},
		[lyrics, meta?.offset],
	)

	const listHeader = useMemo(() => (
		<>
			{blankComponent}
			<View style={styles.lyricMeta}></View>
		</>
	), [blankComponent])

	const renderLyricItem = useCallback(({ item, index }: { item: ILyric.IParsedLrcItem; index: number }) => {
		const isActive = activeIndex === index
		return (
			<LyricItemComponent
				index={index}
				text={item.lrc}
				fontSize={fontSizeStyle.fontSize}
				onLayout={handleLyricItemLayout}
				light={draggingIndex === index}
				highlight={isActive}
				distance={activeIndex < 0 ? 0 : Math.abs(index - activeIndex)}
				karaokeSegs={isActive
					? findKaraokeSegs(karaokeMap, Number(item?.time ?? 0) * 1000)
					: undefined}
				karaokeNowMs={isActive ? karaokeMs : undefined}
				translation={showTrans ? findTranslation(translationLyrics, item?.time) : undefined}
				onPress={() => handleLyricItemPress(index)}
			/>
		)
	}, [fontSizeStyle.fontSize, handleLyricItemLayout, draggingIndex, activeIndex, handleLyricItemPress, karaokeMap, karaokeMs, showTrans, translationLyrics])

	return (
		<>
			<View style={styles.fwflex1}>
				{loading ? (
					<View style={styles.fwflex1}>
						<ActivityIndicator size="large" color={colors.loading} />
					</View>
				) : lyrics?.length ? (
					<MaskedView
						style={{ flex: 1 }}
						maskElement={
							<LinearGradient
								colors={['transparent', '#fff', '#fff', 'transparent']}
								locations={[0, 0.18, 0.82, 1]}
								style={StyleSheet.absoluteFill}
							/>
						}
					>
					<LyricFlatList
						ref={(_) => {
							listRef.current = _
						}}
						viewabilityConfig={{
							itemVisiblePercentThreshold: 100,
						}}
						onScrollToIndexFailed={({ index }) => {
							logInfo('[lyric] scrollToIndex failed index=', index)
							delay(120).then(() => {
								scrollToLyricIndex(index ?? 0, lyrics.length, true)
							})
						}}
						fadingEdgeLength={120}
					ListHeaderComponent={listHeader}
					ListFooterComponent={blankComponent}
					scrollEnabled={scrollEnabled}
					onContentSizeChange={() => {
						// 全屏层常驻渲染时，首次布局完成得晚：内容尺寸就绪后再定位一次
						if (scrollEnabled) setTimeout(() => scrollToCurrentLrcItem(), 60)
					}}
					onScrollBeginDrag={onScrollBeginDrag}
					onMomentumScrollEnd={onScrollEndDrag}
					onScroll={(e) => {
						scrollOffsetRef.current = e.nativeEvent.contentOffset.y
						onScroll(e)
					}}
					onScrollEndDrag={(e) => {
						// 列表已在顶部还继续下拉 → 收起全屏歌词
						if (scrollOffsetRef.current < -55) onRequestClose?.()
						void onScrollEndDrag()
					}}
					scrollEventThrottle={32}
					style={styles.wrapper}
					data={lyrics}
					initialNumToRender={30}
					overScrollMode="never"
					extraData={activeIndex}
					getItemLayout={getItemLayout}
					renderItem={renderLyricItem}
					/>
					</MaskedView>
				) : (
					<View style={styles.fullCenter}>
						<Text style={[styles.white, fontSizeStyle]}>{tr('暂无歌词', 'No lyrics')}</Text>
					</View>
				)}
			</View>
		</>
	)
}

const createStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	wrapper: {
		width: '100%',
		marginVertical: rpx(48),
		flex: 1,
	},
	fwflex1: {
		width: '100%',
		flex: 1,
	},
	empty: {
		paddingTop: '70%',
	},
	white: {
		color: colors.text,
	},
	lyricMeta: {
		position: 'absolute',
		width: '100%',
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		left: 0,
		paddingHorizontal: rpx(48),
		bottom: rpx(48),
	},
	lyricMetaText: {
		color: colors.text,
		opacity: 0.8,
		maxWidth: '80%',
	},
	linkText: {
		color: colors.primary,
		textDecorationLine: 'underline',
	},
	fullCenter: {
		width: '100%',
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},

	singleLine: {
		width: '67%',
		height: 1,
		backgroundColor: colors.separator,
		opacity: 0.4,
	},
	playIcon: {
		width: rpx(90),
		textAlign: 'right',
		color: colors.text,
	},
	searchLyric: {
		width: rpx(180),
		marginTop: rpx(14),
		paddingVertical: rpx(10),
		textAlign: 'center',
		alignSelf: 'center',
		color: colors.primary,
		textDecorationLine: 'underline',
	},
	})
