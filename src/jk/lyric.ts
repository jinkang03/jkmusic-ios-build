/**
 * 歌词：优先走 JKMUSIC 的 musicSdk（多源），失败时回退到 Cymusic 原有实现。
 */
import { getLyric as getJkLyric } from './musicSdk'
import type { JKMusic } from './musicSdk'
import { trackToJk } from './adapt'
import { resolvedFromStore } from '@/player/PlayerStore'
import { logInfo, logError } from '@/helpers/logger'
import type { Track } from '@/player/types'

export interface LyricResult {
	lyric: string
	tlyric?: string | null
	lxlyric?: string | null
}

/** 成功歌词缓存：同一首歌重复进入/重播不再重新请求，避免偶发失败 */
const lyricCache = new Map<string, LyricResult>()
const cacheKeyOf = (music: JKMusic) => `${String(music?.source ?? '')}:${String(music?.id ?? '')}`

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
const buildSwappedMusic = (music: JKMusic, audioSource?: string): JKMusic | null => {
	try {
		const swapped = resolvedFromStore.getValue()
		if (!swapped?.toId || swapped.to === music.source) return null
		// 关键：只有「音频确实来自换源目标」时才用换源歌词。
		// resolvedFromStore 可能是上一首/上一次尝试的残留，若音频其实是原平台（tx），
		// 却拿另一个平台（kw）的歌词，两版时间轴不同 → 整行偏移（实测差 1-5 秒）。
		if (audioSource && swapped.to !== audioSource) return null
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
		for (const src of ['kw', 'wy', 'tx', 'kg', 'mg'] as const) {
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
	// 手动下载的歌曲：优先读同名 sidecar（离线也有歌词）
	try {
		const localPath = String((track as any)?.url ?? '')
		if (localPath.includes('/downloads/')) {
			const { readSidecar } = await import('./downloadStore')
			const side = await readSidecar(localPath)
			if (side.lyric && side.lyric.length > 10) {
				logInfo('[jk/lyric] local sidecar', localPath.split('/').pop())
				return { lyric: side.lyric, tlyric: side.translation || null, lxlyric: null }
			}
		}
	} catch { /* ignore */ }
	const music: JKMusic = trackToJk(track)
	// 音频实际来源：缓存文件可能来自换源，index 里记了 actualSource
	let audioSource = String(music.source ?? '')
	try {
		const u = String((track as any)?.url ?? '')
		if (u.includes('/musicCache/')) {
			const base = u.split('/').pop() ?? ''
			const { readCacheIndex } = await import('@/player/CacheManager')
			const idx: any = await readCacheIndex()
			const actual = idx?.[base]?.actualSource
			if (actual) audioSource = String(actual)
		}
	} catch { /* ignore */ }
	// 流式播放没有缓存文件：音频实际来源就是 resolvedFromStore 里的换源目标。
	// 不补这一步会导致「企鹅 → 酷我」的歌仍拿 tx 的 id 去要歌词，偶发拿不到。
	try {
		const u = String((track as any)?.url ?? '')
		if (!u.includes('/musicCache/')) {
			const swappedInfo = resolvedFromStore.getValue()
			if (swappedInfo?.to && swappedInfo?.title === music.name) {
				audioSource = String(swappedInfo.to)
			}
		}
	} catch { /* ignore */ }
	const swapped = buildSwappedMusic(music, audioSource)
	const cached = lyricCache.get(cacheKeyOf(music))
	if (cached && isUsableLyric(cached)) {
		logInfo('[jk/lyric] cache hit', cacheKeyOf(music))
		return cached
	}
	try {
		const target = swapped ?? music
		logInfo('[jk/lyric] source=', String(target.source), 'id=', String(target.id),
			'audioSource=', audioSource, 'swapped=', String(!!swapped))
		const fetchOnce = async(): Promise<any> => {
			try {
				const r = await getJkLyric(target)
				const text = String(r?.lyric ?? '')
				logInfo('[jk/lyric] raw len=', text.length, 'lx=', String(r?.lxlyric ?? '').length,
					'tl=', String(r?.tlyric ?? '').length, 'usable=', isUsableLyric(r))
				return r
			} catch (e) {
				logError('[jk/lyric] request failed', String((e as any)?.message ?? e))
				return null
			}
		}
		let res = await fetchOnce()
		// 偶发失败（超时/限流）：1.2 秒后重试一次
		if (!isUsableLyric(res)) {
			await new Promise(r => setTimeout(r, 1200))
			const retry = await fetchOnce()
			if (isUsableLyric(retry)) res = retry
		}
		if (isUsableLyric(res)) {
			const n = normalize(res)
			lyricCache.set(cacheKeyOf(music), n)
			logInfo('[jk/lyric] got lyric=', String(n.lyric?.length ?? 0),
				'lx=', String(n.lxlyric ?? '').length, 'tl=', String(n.tlyric ?? '').length)
			return n
		}
		// 当前源没词 → 先用原曲目再试（换源场景），再走同曲多源兜底
		if (swapped) {
			try {
				const orig = await getJkLyric(music)
				if (isUsableLyric(orig)) {
					const n = normalize(orig)
					lyricCache.set(cacheKeyOf(music), n)
					return n
				}
			} catch { /* ignore */ }
		}
		const alt = await fetchLyricFromOtherSources(music)
		if (alt) {
			lyricCache.set(cacheKeyOf(music), alt)
			return alt
		}
		logError('[jk/lyric] 所有来源都没有可用歌词', cacheKeyOf(music))
		return normalize(res)
	} catch (err) {
		logError('[jk/lyric] sdk failed, fallback', String((err as any)?.message ?? err))
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
			logError('[jk/lyric] fallback failed', String((err2 as any)?.message ?? err2))
			return { lyric: '[00:00.00]暂无歌词' }
		}
	}
}

export default fetchLyric
