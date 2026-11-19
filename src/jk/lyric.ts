/**
 * 歌词：优先走 JKMUSIC 的 musicSdk（多源），失败时回退到 Cymusic 原有实现。
 */
import { getLyric as getJkLyric } from './musicSdk'
import type { JKMusic } from './musicSdk'
import { trackToJk } from './adapt'
import { resolvedFromStore } from '@/player/PlayerStore'
import { logInfo } from '@/helpers/logger'
import type { Track } from '@/player/types'

export interface LyricResult {
	lyric: string
	tlyric?: string | null
	lxlyric?: string | null
}

const normalize = (raw: any): LyricResult => {
	if (!raw) return { lyric: '[00:00.00]暂无歌词' }
	if (typeof raw === 'string') return { lyric: raw }
	return {
		lyric: raw.lyric ?? raw.lrc ?? '[00:00.00]暂无歌词',
		tlyric: raw.tlyric ?? raw.tlrc ?? null,
		// 逐字歌词（lx-music 的 lxlyric），链路上曾被丢弃
		lxlyric: raw.lxlyric ?? null,
	}
}

/**
 * 换源后歌词要跟着换源：
 * 酷狗曲目换到酷我播放时，酷狗歌词接口对这歌往往没有词；
 * 用 resolvedFromStore 记录的实际源 + 实际曲目 id 去请求，命中率更高。
 */
const buildSwappedMusic = (music: JKMusic): JKMusic | null => {
	try {
		const swapped = resolvedFromStore.getValue()
		if (!swapped?.toId || swapped.to === music.source) return null
		if (swapped.title && music.name && swapped.title !== music.name) return null
		const meta: any = {
			...(music.meta ?? {}),
			songmid: swapped.toId,
			hash: swapped.toId,
			source: swapped.to,
		}
		return { ...music, id: swapped.toId, source: swapped.to as any, meta }
	} catch {
		return null
	}
}

const isUsableLyric = (res: any) => {
	const text = String(res?.lyric ?? '')
	return text.length > 20 && !text.includes('暂无歌词')
}

/**
 * 歌词兜底：某源没有词时，用「歌名+歌手」去同曲多源索引里找其它源再试。
 * 酷狗大量曲目歌词接口返回空，但换到 kw/tx/wy 往往有词。
 */
const fetchLyricFromOtherSources = async(music: JKMusic): Promise<LyricResult | null> => {
	try {
		const idx = await import('@/jk/crossSourceIndex')
		const hits = idx.lookup(music.name, music.singer)
		for (const e of hits) {
			if (!e?.id || e.source === music.source) continue
			try {
				const alt: JKMusic = {
					id: String(e.id),
					name: String(e.name || music.name || ''),
					singer: String(e.singer || music.singer || ''),
					source: e.source as any,
					interval: music.interval ?? null,
					meta: { songmid: String(e.id), hash: String(e.id), source: e.source },
				}
				const res = await getJkLyric(alt)
				if (isUsableLyric(res)) {
					logInfo('[jk/lyric] fallback-source', String(e.source), 'id=', String(e.id))
					return normalize(res)
				}
			} catch { /* 试下一个源 */ }
		}
	} catch { /* ignore */ }

	// 索引里没有该曲（用户没搜过）→ 实时搜索各源找同曲歌词
	try {
		const { searchBySource } = await import('@/jk/musicSdk')
		const title = String(music.name ?? '')
		const singer = String(music.singer ?? '')
		if (!title) return null
		const norm = (v: any) => String(v ?? '').toLowerCase().replace(/[\s\-_·・,，.。()（）]/g, '')
		const t = norm(title)
		const a = norm(singer)
		for (const src of ['kw', 'wy', 'tx'] as const) {
			if (src === music.source) continue
			try {
				const list = await Promise.race([
					searchBySource(src, `${title} ${singer}`.trim(), 1, 5),
					new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 6000)),
				])
				const hit = (list ?? []).find((m: any) => {
					const mt = norm(m?.name)
					const ma = norm(m?.singer)
					const titleOk = !!mt && (mt.includes(t) || t.includes(mt))
					const artistOk = !a || !ma || ma.includes(a) || a.includes(ma)
					return titleOk && artistOk
				})
				if (!hit) continue
				const res = await getJkLyric(hit as any)
				if (isUsableLyric(res)) {
					logInfo('[jk/lyric] search-fallback', src, String(hit?.id ?? ''))
					return normalize(res)
				}
			} catch { /* 试下一个源 */ }
		}
	} catch { /* ignore */ }
	return null
}

export const fetchLyric = async(track: Track): Promise<LyricResult> => {
	const music: JKMusic = trackToJk(track)
	const swapped = buildSwappedMusic(music)
	try {
		const target = swapped ?? music
		logInfo('[jk/lyric] source=', String(target.source), 'id=', String(target.id), 'swapped=', String(!!swapped))
		const res = await getJkLyric(target)
		if (isUsableLyric(res)) return normalize(res)
		// 当前源没词 → 先用原曲目再试（换源场景），再走同曲多源兜底
		if (swapped) {
			try {
				const orig = await getJkLyric(music)
				if (isUsableLyric(orig)) return normalize(orig)
			} catch { /* ignore */ }
		}
		const alt = await fetchLyricFromOtherSources(music)
		if (alt) return alt
		return normalize(res)
	} catch (err) {
		console.log('[jk/lyric] sdk failed, fallback', err)
		// 换源歌词失败时退回原曲目再试一次，避免比不换源还差
		if (swapped) {
			try {
				const orig = await getJkLyric(music)
				if (isUsableLyric(orig)) return normalize(orig)
			} catch { /* fallthrough */ }
		}
		{
			const alt = await fetchLyricFromOtherSources(music)
			if (alt) return alt
		}
		try {
			const { myGetLyric } = await import('@/helpers/userApi/getMusicSource')
			return normalize(await myGetLyric(track))
		} catch (err2) {
			console.log('[jk/lyric] fallback failed', err2)
			return { lyric: '[00:00.00]暂无歌词' }
		}
	}
}

export default fetchLyric
