/**
 * 设置滑块。
 *
 * 注意：react-native-awesome-slider 的 `step` 语义是「分段数量」不是「步长」，
 * 传 0.25 会走到库内部 new Array(step + 1) → RangeError: invalid array length，
 * 直接让整个 App 崩溃（slide.js:372）。所以这里不传 step、关掉 snapToStep，
 * 自己在 onSlidingComplete 里按步长取整。
 */
import React from 'react'
import { Text, View } from 'react-native'
import { Slider } from 'react-native-awesome-slider'
import { useSharedValue } from 'react-native-reanimated'
import { macFont, macPalette } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'

const SettingSlider = ({
	value, min, max, step = 1, onChange, format,
}: {
	value: number
	min: number
	max: number
	step?: number
	onChange: (v: number) => void
	format?: (v: number) => string
}) => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const progress = useSharedValue(Number(value ?? min))
	const minShared = useSharedValue(min)
	const maxShared = useSharedValue(max)
	const [display, setDisplay] = React.useState(Number(value ?? min))

	// 外部值变化（dev 钩子写入 / 导入备份）时同步滑块位置，否则只改文字不改位置
	React.useEffect(() => {
		const v = Number(value ?? min)
		progress.value = v
		setDisplay(v)
	}, [value, min])

	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: 190 }}>
			<View style={{ flex: 1 }}>
				<Slider
					style={{ flex: 1 }}
					minimumValue={minShared}
					maximumValue={maxShared}
					progress={progress}
					snapToStep={false}
					renderBubble={() => null}
					disableTapEvent={false}
					onValueChange={(v: number) => {
						progress.value = v
						setDisplay(v)
					}}
					onSlidingComplete={(v: number) => {
						const snapped = Math.round(v / step) * step
						progress.value = snapped
						setDisplay(snapped)
						onChange(snapped)
					}}
					theme={{
						minimumTrackTintColor: c.primary,
						maximumTrackTintColor: c.fillMuted,
						disableMinTrackTintColor: c.fillMuted,
					}}
				/>
			</View>
			<Text style={{ color: c.textMuted, fontSize: macFont.caption, width: 44, textAlign: 'right' }}>
				{format ? format(display) : String(display)}
			</Text>
		</View>
	)
}

export default SettingSlider
