/**
 * 歌词：优先走 JKMUSIC 的 musicSdk（多源），失败时回退到 Cymusic 原有实现。
 */
import { getLyric as getJkLyric } from './musicSdk'
import type { JKMusic } from './musicSdk'
import { trackToJk } from './adapt'
import type { Track } from '@/player/types'

export interface LyricResult {
	lyric: string
	tlyric?: string | null
}

const normalize = (raw: any): LyricResult => {
	if (!raw) return { lyric: '[00:00.00]暂无歌词' }
	if (typeof raw === 'string') return { lyric: raw }
	return {
		lyric: raw.lyric ?? raw.lrc ?? '[00:00.00]暂无歌词',
		tlyric: raw.tlyric ?? raw.tlrc ?? null,
	}
}

export const fetchLyric = async(track: Track): Promise<LyricResult> => {
	const music: JKMusic = trackToJk(track)
	try {
		const res = await getJkLyric(music)
		return normalize(res)
	} catch (err) {
		console.log('[jk/lyric] sdk failed, fallback', err)
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
