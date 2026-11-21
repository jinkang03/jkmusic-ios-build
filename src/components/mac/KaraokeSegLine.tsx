/**
 * 逐字歌词行：按 lxlyric 的 seg（中文按字、英文按词）逐段填充。
 *
 * 与 mac 的 `background-clip: text` 等价：
 * 每段是独立元素，按自己的 start/dur 推进，所以填充严格对齐正在唱的字，
 * 不会被「整行字符数平均」带偏（中英文混排尤其明显）。
 */
import React from 'react'
import { StyleSheet, TextStyle, View } from 'react-native'
import KaraokeFillText from './KaraokeFillText'

type Seg = { start: number, dur?: number, text: string }

type Props = {
	/** 整行文本（无 segs 时回退用） */
	text: string
	segs?: Seg[]
	nowMs: number
	activeColor: string
	inactiveColor: string
	textStyle?: TextStyle
	/** 无 segs 时的整行进度 */
	fallbackProgress?: number
	numberOfLines?: number
}

const KaraokeSegLine = ({
	text,
	segs,
	nowMs,
	activeColor,
	inactiveColor,
	textStyle,
	fallbackProgress = 0,
	numberOfLines = 1,
}: Props) => {
	if (!segs || segs.length === 0) {
		return (
			<KaraokeFillText
				text={text}
				progress={fallbackProgress}
				activeColor={activeColor}
				inactiveColor={inactiveColor}
				textStyle={textStyle}
				numberOfLines={numberOfLines}
			/>
		)
	}
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
			{segs.map((seg, index) => {
				const dur = Math.max(1, Number(seg.dur) || 0)
				const raw = (nowMs - seg.start) / dur
				const progress = Math.min(1, Math.max(0, raw))
				return (
					<View key={`${index}-${seg.start}`} style={styles.seg}>
						<KaraokeFillText
							text={seg.text}
							progress={progress}
							activeColor={activeColor}
							inactiveColor={inactiveColor}
							textStyle={textStyle}
							numberOfLines={1}
						/>
					</View>
				)
			})}
		</View>
	)
}

const styles = StyleSheet.create({
	seg: {
		// 段与段之间不额外加间距：seg.text 本身带空格/标点
		flexDirection: 'row',
	},
})

export default KaraokeSegLine
