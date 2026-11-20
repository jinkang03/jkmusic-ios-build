/**
 * 逐字歌词的「平滑填充」渲染。
 *
 * 旧实现是「每个字到点才变色」——视觉上是一格一格跳，用户反馈不丝滑。
 * 这里改成两层文字叠加：底层灰色，上层强调色按进度裁剪宽度，
 * 并且每 100ms 只更新一次目标宽度，用 120ms 线性动画补间 → 连续推进。
 */
import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, TextStyle, View } from 'react-native'

type Props = {
	text: string
	/** 0..1：当前行已唱比例（支持小数，字内插值） */
	progress: number
	activeColor: string
	inactiveColor: string
	textStyle?: TextStyle | TextStyle[]
	numberOfLines?: number
	/** 翻译行等次级内容：字体更小、透明度略低 */
	opacity?: number
}

const KaraokeFillText = ({
	text,
	progress,
	activeColor,
	inactiveColor,
	textStyle,
	numberOfLines = 1,
	opacity = 1,
}: Props) => {
	const [width, setWidth] = useState(0)
	const anim = useRef(new Animated.Value(0)).current
	const pct = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))

	useEffect(() => {
		if (width <= 0) return
		Animated.timing(anim, {
			toValue: pct * width,
			duration: 120,
			easing: Easing.linear,
			useNativeDriver: false,
		}).start()
	}, [pct, width, anim])

	return (
		<View
			onLayout={({ nativeEvent }) => {
				const w = Math.round(nativeEvent.layout.width)
				if (w > 0 && w !== width) setWidth(w)
			}}
			style={{ position: 'relative', opacity }}
		>
			<Text numberOfLines={numberOfLines} style={[textStyle, { color: inactiveColor }]}>
				{text}
			</Text>
			{width > 0 ? (
				<Animated.View
					pointerEvents="none"
					style={[StyleSheet.absoluteFill, { width: anim, overflow: 'hidden' }]}
				>
					{/* 宽度固定为整行宽，避免被裁剪时换行 */}
					<Text numberOfLines={numberOfLines} style={[textStyle, { color: activeColor, width }]}>
						{text}
					</Text>
				</Animated.View>
			) : null}
		</View>
	)
}

export default KaraokeFillText
