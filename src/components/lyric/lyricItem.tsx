import { ThemeColors } from '@/constants/tokens'
import { useThemeColors } from '@/hooks/useAppTheme'
import rpx from '@/utils/rpx'
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
	karaokeSegs?: Array<{ start: number, text: string }>
	/** 当前播放位置（毫秒），用于判断已唱/未唱 */
	karaokeNowMs?: number
	/** 翻译行（设置里开启「歌词翻译」时传入） */
	translation?: string
}

function _LyricItemComponent(props: ILyricItemComponentProps) {
	const { highlight, text, onLayout, index, fontSize, onPress, karaokeSegs, karaokeNowMs, translation } = props
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
				{hasKaraoke ? (
					// 逐字：单个 Text 内嵌多个 Text，颜色才能按分段生效（View+row 不行）
					<Text
						onLayout={({ nativeEvent }) => {
							if (index !== undefined) onLayout?.(index, nativeEvent.layout.height)
						}}
						style={[lyricStyles.item, lyricStyles.highlightItem, { fontSize: fontSize || rpx(28), color: colors.primary }]}
					>
						{karaokeSegs!.map((seg, si) => (
							<Text
								key={`k${si}`}
								style={{ color: (karaokeNowMs ?? 0) >= seg.start ? colors.primary : colors.textMuted }}
							>
								{seg.text}
							</Text>
						))}
					</Text>
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
					<Text style={[lyricStyles.translation, { fontSize: Math.max(12, (fontSize || rpx(28)) - 6) }]}>
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
		prev.karaokeSegs === curr.karaokeSegs,
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
