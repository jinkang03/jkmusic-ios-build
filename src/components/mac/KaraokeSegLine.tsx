/**
 * 逐字歌词行（v2，按 mac 的 `lyric-font-player` 模型重做）。
 *
 * mac 的做法：
 *   - 每个 `<start,dur>` 段生成一个 `<span>`，段内用 Web Animation 做 `background-size` 0→100% 填充；
 *   - 所有 span 在**同一个行内容器**里自然排版，空格/换行由浏览器负责；
 *   - 播放时传入「当前时间 - 行时间」，用相对时间驱动。
 *
 * RN 没有 `background-clip: text`，也无法对单个字做像素级裁剪而不破坏排版。
 * 之前用「每段一个独立 Text + 宽度裁剪」的实现，英文/含空格的行会因宽度测量和空格 trim
 * 而整体错位（表现为「歌词快了两个字」）。
 *
 * 现在改为：
 *   1. 整行是**一个 Text**，内部嵌套每个 seg 的 Text → 排版与普通文本完全一致；
 *   2. 已唱 = 主色，未唱 = 灰，正在唱的那一段在两者之间做颜色插值；
 *   3. 段区间用 `[start, min(nextStart, start+dur))`，与 mac 的调度口径一致。
 *
 * 视觉上与 mac 的差别：mac 是字内横向扫过，这里是整字渐变。在 14–22px 字号下几乎不可分辨，
 * 但排版 100% 正确，这是「不偏移」的前提。
 */
import React from 'react'
import { Text, TextStyle } from 'react-native'

type Seg = { start: number, dur?: number, text: string }

type Props = {
	/** 整行文本（无 segs 时回退用） */
	text: string
	segs?: Seg[]
	nowMs: number
	activeColor: string
	inactiveColor: string
	textStyle?: TextStyle
	/** 无 segs 时的整行进度（0..1） */
	fallbackProgress?: number
	numberOfLines?: number
}

/* ---------------- 颜色插值 ---------------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const parseColor = (input: string): [number, number, number] | null => {
	const s = String(input ?? '').trim()
	if (!s) return null
	if (s.startsWith('#')) {
		let hex = s.slice(1)
		if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
		if (hex.length === 8) hex = hex.slice(0, 6)
		if (hex.length !== 6) return null
		const n = parseInt(hex, 16)
		if (!Number.isFinite(n)) return null
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
	}
	const m = s.match(/rgba?\(([^)]+)\)/i)
	if (!m) return null
	const parts = m[1].split(',').map(p => Number(p.trim()))
	if (parts.length < 3 || parts.some(v => !Number.isFinite(v))) return null
	return [parts[0], parts[1], parts[2]]
}

/** t=0 → from，t=1 → to */
const mixColor = (from: string, to: string, t: number): string => {
	const k = clamp01(t)
	if (k <= 0) return from
	if (k >= 1) return to
	const a = parseColor(from)
	const b = parseColor(to)
	if (!a || !b) return k > 0.5 ? to : from
	const r = Math.round(a[0] + (b[0] - a[0]) * k)
	const g = Math.round(a[1] + (b[1] - a[1]) * k)
	const bl = Math.round(a[2] + (b[2] - a[2]) * k)
	return `rgb(${r},${g},${bl})`
}

/* ---------------- 组件 ---------------- */

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
	// 没有逐字段：整行按比例插值（保持旧行为，用于只有 lrc 没有 lxlrc 的歌）
	if (!segs || segs.length === 0) {
		const p = clamp01(fallbackProgress)
		return (
			<Text numberOfLines={numberOfLines} style={[textStyle, { color: mixColor(inactiveColor, activeColor, p) }]}>
				{text}
			</Text>
		)
	}

	// 80ms 量化：颜色插值不需要 60fps，降低 Text 重渲染次数
	const t = Math.floor(nowMs / 80) * 80

	return (
		<Text numberOfLines={numberOfLines} style={textStyle}>
			{segs.map((seg, index) => {
				const start = Number(seg.start) || 0
				const nextStart = Number(segs[index + 1]?.start)
				// 段区间：优先用 dur，但不超过下一段起点（与 mac 的调度口径一致）
				const durRaw = Number(seg.dur) || 0
				const end = Number.isFinite(nextStart) && nextStart > start
					? Math.min(nextStart, start + (durRaw > 0 ? durRaw : nextStart - start))
					: start + (durRaw > 0 ? durRaw : 300)
				const span = Math.max(1, end - start)
				const progress = t <= start ? 0 : t >= end ? 1 : (t - start) / span
				return (
					<Text key={`${index}-${start}`} style={{ color: mixColor(inactiveColor, activeColor, progress) }}>
						{seg.text}
					</Text>
				)
			})}
		</Text>
	)
}

export default KaraokeSegLine
