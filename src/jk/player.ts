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

/**
 * 解析播放地址。
 *
 * 注意：真实播放链路走的是 `src/utils/utils.ts` 的 `getOnlineOtherSourceMusicUrl`
 * （先试当前源，失败自动换源，并把结果交给 RNTP）。这里改为委托同一个函数，
 * 保证「本文件」与「播放器实际行为」永远不会出现两套不一致的实现。
 */
export const resolveMusicUrl = async(music: JKMusic, quality = '320k'): Promise<ResolvedSource> => {
	const { getOnlineOtherSourceMusicUrl } = await import('@/utils/utils')
	const musicInfos = [trackToJk(jkToTrack(music)) as any]
	const res = await getOnlineOtherSourceMusicUrl({
		musicInfos,
		quality: quality as any,
		onToggleSource: () => undefined,
		isRefresh: false,
	})
	const url = (res as any)?.url
	if (!url) throw new Error('未获取到播放地址')
	return { url, quality: (res as any)?.quality ?? quality }
}

/** JK 条目 → Cymusic Track（供队列与 UI 使用） */
export const toTrack = (music: JKMusic): Track => jkToTrack(music)

/** Cymusic Track → JK 条目 */
export const fromTrack = (track: Track): JKMusic => trackToJk(track)

export default { resolveMusicUrl, toTrack, fromTrack }
