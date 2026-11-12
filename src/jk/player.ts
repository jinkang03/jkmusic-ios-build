/**
 * 播放桥：把 JKMUSIC 的歌曲条目交给 Cymusic 的 RNTP 播放器。
 * 播放地址由 JKMUSIC 源解析（内置 SDK + 自定义源），再转成 RNTP 的 MediaItem。
 */
import type { JKMusic } from './musicSdk'
import { trackToJk, jkToTrack } from './adapt'
import type { Track } from '@/player/types'

export interface ResolvedSource {
	url: string
	quality?: string
	headers?: Record<string, string>
}

/** 用 JKMUSIC SDK 解析播放地址（需要已绑定自定义源） */
export const resolveMusicUrl = async(music: JKMusic, quality = '320k'): Promise<ResolvedSource> => {
	const sdk = (await import('@/components/utils/musicSdk')).default as any
	const mod = sdk[music.source]
	if (!mod?.getMusicUrl) throw new Error(`${music.source} 不支持取地址`)
	const res = await mod.getMusicUrl(music, quality).promise
	const url = typeof res === 'string' ? res : res?.url
	if (!url) throw new Error('未获取到播放地址')
	return { url, quality: typeof res === 'object' ? res.type : quality }
}

/** JK 条目 → Cymusic Track（供队列与 UI 使用） */
export const toTrack = (music: JKMusic): Track => jkToTrack(music)

/** Cymusic Track → JK 条目 */
export const fromTrack = (track: Track): JKMusic => trackToJk(track)

export default { resolveMusicUrl, toTrack, fromTrack }
