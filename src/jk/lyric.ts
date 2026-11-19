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

export const fetchLyric = async(track: Track): Promise<LyricResult> => {
	const music: JKMusic = trackToJk(track)
	const swapped = buildSwappedMusic(music)
	try {
		const target = swapped ?? music
		logInfo('[jk/lyric] source=', String(target.source), 'id=', String(target.id), 'swapped=', String(!!swapped))
		const res = await getJkLyric(target)
		return normalize(res)
	} catch (err) {
		console.log('[jk/lyric] sdk failed, fallback', err)
		// 换源歌词失败时退回原曲目再试一次，避免比不换源还差
		if (swapped) {
			try {
				return normalize(await getJkLyric(music))
			} catch { /* fallthrough */ }
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
