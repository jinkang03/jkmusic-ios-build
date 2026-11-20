/**
 * 逐字歌词解析（lx-music 的 lxlyric 格式）。
 * 输入形如: `<0,300>我<300,200>用<500,250>沉默`
 * 输出绝对时间的分段；无标记或异常 → 返回 []（调用方回退整行高亮）。
 */
export type KaraokeSeg = { start: number, dur: number, text: string }

const SEG_RE = /<(\d+),(\d+)>([^<]*)/g

export const parseKaraokeLine = (line: string, lineTimeMs: number): KaraokeSeg[] => {
	try {
		const raw = String(line ?? '')
		if (!raw || raw.indexOf('<') < 0) return []
		const segs: KaraokeSeg[] = []
		SEG_RE.lastIndex = 0
		let m: RegExpExecArray | null
		while ((m = SEG_RE.exec(raw)) !== null) {
			const start = Number(m[1])
			const dur = Number(m[2])
			const text = m[3] ?? ''
			// <0,0> 之类是占位段，跳过
			if (!text) continue
			segs.push({ start: lineTimeMs + (Number.isFinite(start) ? start : 0), dur: Number.isFinite(dur) ? dur : 0, text })
		}
		return segs
	} catch {
		return []
	}
}

export const hasKaraokeMarkup = (line: string) => /<\d+,\d+>/.test(String(line ?? ''))

export default { parseKaraokeLine, hasKaraokeMarkup }

/**
 * 逐行解析 lxlyric：`[mm:ss.mmm]<s,d>字<s,d>字…` → Map<行时间ms, 分段[]>
 * 段的 start 已加行时间（绝对毫秒）。
 */
export const buildKaraokeMap = (lxlyric: string): Map<number, KaraokeSeg[]> => {
	const map = new Map<number, KaraokeSeg[]>()
	try {
		const raw = String(lxlyric ?? '')
		if (!raw) return map
		const lines = raw.split('\n')
		const timeRe = /^\[(\d+):(\d+)\.(\d+)\]/
		for (const line of lines) {
			const m = timeRe.exec(line)
			if (!m) continue
			const lineMs = Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3].padEnd(3, '0').slice(0, 3))
			const body = line.slice(m[0].length)
			const segs = parseKaraokeLine(body, lineMs)
			if (segs.length) map.set(lineMs, segs)
		}
	} catch { /* 解析失败返回已解析部分 */ }
	return map
}

/** 允许 ±tolerance 的时间匹配（行时间可能有毫秒级误差） */
/**
 * 当前行的「已唱比例」（0..1），支持字内插值：
 * 段内按 dur 线性推进，而不是「到点才整字变色」。
 */
export const karaokeLineProgress = (
	segs: Array<{ start: number, dur?: number, text: string }>,
	nowMs: number,
): number => {
	if (!segs?.length) return 0
	let total = 0
	let sung = 0
	segs.forEach((seg, index) => {
		const len = Math.max(1, String(seg.text ?? '').length)
		total += len
		const nextStart = Number(segs[index + 1]?.start ?? 0)
		// 没有 dur 时用「到下一段开始」兜底，避免退化成整字跳变
		const dur = Math.max(1, Number(seg.dur) || 0) || Math.max(1, nextStart - Number(seg.start ?? 0)) || 200
		if (nowMs >= seg.start + dur) sung += len
		else if (nowMs > seg.start) sung += len * ((nowMs - seg.start) / dur)
	})
	return total > 0 ? Math.min(1, sung / total) : 0
}

export const findKaraokeSegs = (map: Map<number, KaraokeSeg[]>, lineMs: number, tolerance = 30): KaraokeSeg[] => {
	if (!map.size) return []
	const direct = map.get(Math.round(lineMs))
	if (direct) return direct
	let bestKey = -1
	let bestDiff = Number.POSITIVE_INFINITY
	for (const key of map.keys()) {
		const diff = Math.abs(key - lineMs)
		if (diff < bestDiff) { bestDiff = diff; bestKey = key }
	}
	return bestDiff <= tolerance && bestKey >= 0 ? (map.get(bestKey) ?? []) : []
}
