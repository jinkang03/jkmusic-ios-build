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
import { Pressable, Text, View } from 'react-native'
import LyricManager from '@/helpers/lyricManager'
import myTrackPlayer, { nowLyricState } from '@/helpers/trackPlayerIndex'
import { macFont, macPalette } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'

const ROW_HEIGHT = 28
const WINDOW = 2

const MiniLyric = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const state: any = LyricManager.useLyricState()
	const current: any = LyricManager.useCurrentLyric()
	const raw: string = nowLyricState.useValue() as any
	// 切歌时清掉上一首的歌词：否则新曲还在加载中会显示「上一首」的歌词（实测出现过串台）
	const currentTrack: any = myTrackPlayer.useCurrentMusic()
	const lastTrackRef = React.useRef<string>('')
	React.useEffect(() => {
		const key = `${currentTrack?.platform ?? ''}:${currentTrack?.id ?? ''}`
		if (!key || key === lastTrackRef.current) return
		lastTrackRef.current = key
		nowLyricState.setValue('')
	}, [currentTrack?.platform, currentTrack?.id])
	const lyrics: any[] = state?.lyrics ?? []

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

	if (!lyrics.length) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
				<Text style={{ textAlign: 'center', color: c.textMuted, fontSize: 12 }}>暂无歌词</Text>
			</View>
		)
	}

	const start = Math.max(0, currentIndex - WINDOW)
	const end = Math.min(lyrics.length, currentIndex + WINDOW + 1)
	React.useEffect(() => {
		if (raw) LyricManager.requestRefresh()
	}, [raw])

	const rows = lyrics.slice(start, end)

	return (
		<View style={{ flex: 1, justifyContent: 'center', overflow: 'hidden' }}>

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
				const distance = Math.abs(absoluteIndex - currentIndex)
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
						<Text
							numberOfLines={1}
							style={{
								textAlign: 'center',
								color: isCurrent ? c.primary : c.textMuted,
								fontSize: isCurrent ? 16 : macFont.body,
								fontWeight: isCurrent ? '700' : '400',
								opacity,
							}}
						>
							{item?.lrc ?? item?.content ?? ''}
						</Text>
					</Pressable>
				)
			})}
		</View>
	)
}

export default MiniLyric
