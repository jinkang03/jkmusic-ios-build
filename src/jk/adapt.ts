/**
 * LX.Music.MusicInfo ↔ Cymusic Track 互转。
 * Track 只是展示层结构，播放地址仍由 JKMUSIC 源（内置 SDK + 自定义源）解析。
 */
import type { JKMusic, JKSource } from './musicSdk'
import type { Track } from '@/player/types'

const parseInterval = (interval?: string | null): number => {
	if (!interval) return 0
	const parts = interval.split(':').map(n => Number.parseInt(n, 10) || 0)
	return parts.reduce((acc, cur) => acc * 60 + cur, 0)
}

export const jkToTrack = (music: JKMusic): Track => {
	const meta: any = music.meta ?? {}
	// songmid 必须来自 meta：kw 的 id 是数字 rid、kg 是 hash、mg 是 copyrightId，
	// 而脚本要的是原始 songmid；取不到会退化成 15 秒试听片段
	const sm = String(meta?.songmid ?? music.id ?? '')
	return {
		id: sm,
		platform: music.source,
		title: music.name,
		artist: music.singer,
		album: meta.albumName ?? '',
		artwork: meta.picUrl ?? '',
		duration: parseInterval(music.interval),
		songmid: sm,
		// 保留原始条目，取播放地址时直接复用
		lxMusic: music,
	} as Track
}

export const trackToJk = (track: Track): JKMusic => {
	const raw = (track as any).lxMusic as JKMusic | undefined
	if (raw) return raw
	return {
		id: track.id,
		name: track.title ?? '',
		singer: track.artist ?? '',
		source: ((track.platform ?? 'tx') as JKSource),
		interval: null,
		meta: { albumName: track.album, picUrl: track.artwork },
	}
}

export const formatInterval = (seconds: number): string => {
	const m = Math.floor(seconds / 60)
	const s = Math.floor(seconds % 60)
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
