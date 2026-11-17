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
