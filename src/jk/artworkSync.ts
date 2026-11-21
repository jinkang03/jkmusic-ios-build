/**
 * 当前曲目的封面同步（播放页 + 迷你条共用）。
 * 播放页的 useEffect 只在播放页挂载时执行，用户停在其他页面切歌就会「新歌名 + 旧封面」。
 */
import { resolveArtwork } from './artwork'
import { currentArtworkStore } from './artworkStore'
import { logInfo } from '@/helpers/logger'

const inflight = new Map<string, Promise<string>>()
let lastKey = ''

export const syncCurrentArtwork = (track: any) => {
	if (!track) {
		lastKey = ''
		currentArtworkStore.setValue('')
		return
	}
	const key = `${track.platform ?? ''}_${track.id ?? ''}`
	if (lastKey === key && currentArtworkStore.getValue()) return
	lastKey = key
	currentArtworkStore.setValue('')          // 先清，避免串台
	logInfo('[artwork] sync', key)
	const p = inflight.get(key) ?? resolveArtwork(track)
	inflight.set(key, p)
	void p.then(async(url: string) => {
		if (lastKey !== key) return              // 切歌竞态保护
		if (!url) return
		currentArtworkStore.setValue(url)
		// 回写系统「正在播放」的封面：本地下载/缓存曲目的 track.artwork 常常是空的，
		// 只在 mediaItem 初始化时传 artworkUrl 会导致锁屏/灵动岛一直显示黑色。
		try {
			const { default: RNTP } = await import('@rntp/player')
			;(RNTP as any).updateMetadata?.(0, { artworkUrl: url })
			logInfo('[artwork] 已回写系统媒体封面', key)
		} catch { /* 非当前项或播放器未就绪时忽略 */ }
	}).catch(() => undefined).finally(() => inflight.delete(key))
}

export default { syncCurrentArtwork }
