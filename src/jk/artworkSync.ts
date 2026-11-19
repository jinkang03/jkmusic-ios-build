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
	void p.then((url: string) => {
		if (lastKey !== key) return              // 切歌竞态保护
		if (url) currentArtworkStore.setValue(url)
	}).catch(() => undefined).finally(() => inflight.delete(key))
}

export default { syncCurrentArtwork }
