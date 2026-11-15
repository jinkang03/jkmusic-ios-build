/**
 * 封面兜底：kw 的搜索结果 img 恒为 null，歌单/榜单也常为 null。
 * 只对「当前曲目」取图，结果进内存缓存，避免给列表每行发请求。
 */
import { searchBySource } from './musicSdk'
import { logInfo } from '@/helpers/logger'

const cache = new Map<string, string>()

export const resolveArtwork = async(track: any): Promise<string> => {
	if (!track) return ''
	const existing = track.artwork || track?.lxMusic?.meta?.picUrl || track?.lxMusic?.meta?.img
	if (existing && String(existing).startsWith('http')) return String(existing)

	const key = `${track.platform ?? ''}:${track.id ?? ''}`
	const hit = cache.get(key)
	if (hit !== undefined) return hit

	try {
		const query = `${track.title ?? ''} ${track.artist ?? ''}`.trim()
		if (!query) { cache.set(key, ''); return '' }
		const list: any[] = (await searchBySource('tx' as any, query, 1, 3)) ?? []
		const found = list.find((x: any) => String(x?.name ?? '').includes(String(track.title ?? ''))) ?? list[0]
		const url = String(found?.meta?.picUrl ?? found?.meta?.img ?? '')
		cache.set(key, url)
		logInfo('[artwork] resolved', key, url ? 'ok' : 'empty')
		return url
	} catch (err) {
		logInfo('[artwork] failed', key, String((err as any)?.message ?? err))
		cache.set(key, '')
		return ''
	}
}

export default { resolveArtwork }
