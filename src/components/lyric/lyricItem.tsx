import { ThemeColors } from '@/constants/tokens'
import { useThemeColors } from '@/hooks/useAppTheme'
import rpx from '@/utils/rpx'
import KaraokeSegLine from '@/components/mac/KaraokeSegLine'
import * as Haptics from 'expo-haptics'
import React, { memo, useCallback, useMemo, useRef } from 'react'
import { Animated, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native'
interface ILyricItemComponentProps {
	// 行号
	index?: number
	// 显示
	light?: boolean
	// 高亮
	highlight?: boolean
	// 文本
	text?: string
	// 字体大小
	fontSize?: number
	onPress: () => Promise<void>
	onLayout?: (index: number, height: number) => void
	/** 当前行的逐字分段（绝对毫秒 start），为空时回退整行高亮 */
	karaokeSegs?: Array<{ start: number, dur?: number, text: string }>
	/** 当前播放位置（毫秒），用于判断已唱/未唱 */
	karaokeNowMs?: number
	/** 翻译行（设置里开启「歌词翻译」时传入） */
	translation?: string
	/** 与当前行的距离（0=当前行），用于做上下渐隐 */
	distance?: number
}

function _LyricItemComponent(props: ILyricItemComponentProps) {
	const { highlight, text, onLayout, index, fontSize, onPress, karaokeSegs, karaokeNowMs, translation, distance } = props
	// 离当前行越远越淡：纯透明度渐隐（不叠黑色遮罩，背景是壁纸/封面）
	const fadeOpacity = distance === undefined || distance === 0 ? 1 : distance === 1 ? 0.66 : distance === 2 ? 0.4 : 0.24
	const hasKaraoke = !!(highlight && karaokeSegs && karaokeSegs.length)
	const colors = useThemeColors()
	const lyricStyles = useMemo(() => createStyles(colors), [colors])
	const animatedOpacity = useRef(new Animated.Value(0)).current

	const handlePress = useCallback(() => {
		// 触发震动
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

		// 显示背景
		Animated.sequence([
			Animated.timing(animatedOpacity, {
				toValue: 1,
				duration: 600,
				useNativeDriver: true,
			}),
			Animated.timing(animatedOpacity, {
				toValue: 0,
				duration: 200,
				useNativeDriver: true,
			}),
		]).start()

		// 调用原来的 onPress
		onPress()
	}, [onPress, animatedOpacity])

	return (
		<TouchableWithoutFeedback onPress={handlePress}>
			<View>
				<Animated.View
					style={[
						lyricStyles.background,
						{
							opacity: animatedOpacity,
						},
					]}
				/>
				{highlight ? (
					// 当前行：平滑填充（字内插值 + 120ms 宽度补间），比「逐字跳变」顺滑
					<View
						onLayout={({ nativeEvent }) => {
							if (index !== undefined) onLayout?.(index, nativeEvent.layout.height)
						}}
						style={[lyricStyles.item, { paddingVertical: rpx(10) }]}
					>
						<KaraokeSegLine
							text={String(text ?? '')}
							segs={karaokeSegs}
							nowMs={karaokeNowMs ?? 0}
							activeColor={colors.primary}
							inactiveColor={colors.text}
							numberOfLines={2}
							textStyle={{ fontSize: Math.round((fontSize || rpx(28)) * 1.06), textAlign: 'center', fontWeight: '600' }}
						/>
					</View>
				) : (
					<Text
						onLayout={({ nativeEvent }) => {
							if (index !== undefined) {
								onLayout?.(index, nativeEvent.layout.height)
							}
						}}
						style={[
							lyricStyles.item,
							{
								fontSize: fontSize || rpx(28),
								opacity: highlight ? 1 : fadeOpacity,
								// 与 mac 一致：离当前行越远越小
								transform: [{ scale: distance === undefined ? 1 : distance === 1 ? 0.97 : 0.94 }],
							},
							highlight
								? [
										lyricStyles.highlightItem,
										{
											color: colors.primary,
										},
									]
								: null,
							// light ? lyricStyles.draggingItem : null,
						]}
					>
						{text}
					</Text>
				)}
				{translation ? (
					// 翻译行只整行高亮：主歌词的 seg 时间轴不能直接套到译文上
					<Text
						numberOfLines={1}
						style={[
							lyricStyles.translation,
							{
								fontSize: Math.max(12, (fontSize || rpx(28)) - 6),
								opacity: highlight ? 0.9 : fadeOpacity * 0.7,
								color: highlight ? colors.primary : colors.text,
							},
						]}
					>
						{translation}
					</Text>
				) : null}
			</View>
		</TouchableWithoutFeedback>
	)
}
// 歌词
const LyricItemComponent = memo(
	_LyricItemComponent,
	(prev, curr) =>
		prev.light === curr.light &&
		prev.highlight === curr.highlight &&
		prev.text === curr.text &&
		prev.index === curr.index &&
		prev.fontSize === curr.fontSize &&
		prev.karaokeNowMs === curr.karaokeNowMs &&
		prev.karaokeSegs === curr.karaokeSegs &&
		prev.translation === curr.translation &&
		prev.distance === curr.distance,
)

export default LyricItemComponent

const createStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	highlightItem: {
		opacity: 1,
	},
	item: {
		color: colors.text,
		opacity: 0.6,
		paddingHorizontal: rpx(64),
		paddingVertical: rpx(24),
		width: '100%',
		textAlign: 'center',
		textAlignVertical: 'center',
	},
	translation: {
		color: colors.text,
		opacity: 0.55,
		paddingHorizontal: rpx(64),
		marginTop: 2,
		textAlign: 'center',
		width: '100%',
	},
	draggingItem: {
		opacity: 1,
		color: colors.text,
	},
	background: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: colors.overlaySoft,
		borderRadius: rpx(10),
	},
	})
