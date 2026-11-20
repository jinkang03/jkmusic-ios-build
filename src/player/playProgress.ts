/**
 * 保存播放进度（对齐 mac 的 player.isSavePlayTime）。
 *
 * mac 保存的是「当前播放状态」而不是每首歌各自记住：
 *   { time, maxTime, listId, index }
 * 启动时恢复进度并暂停（开关关闭则从 0 开始）。
 */
import PersistStatus from '@/store/PersistStatus'
import { getSetting } from '@/jk/settingsStore'
import { logInfo } from '@/helpers/logger'

export type SavedPlayProgress = {
	trackId: string
	platform: string
	index: number
	position: number
	duration: number
	savedAt: number
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export const isSaveProgressEnabled = () =>
	getSetting<boolean>('player.isSavePlayTime', false) === true

/** 播放中节流保存（调用方负责节流），暂停/切歌时 force 立即写 */
export const savePlayProgress = (info: {
	trackId: string
	platform: string
	index: number
	position: number
	duration: number
}) => {
	if (!isSaveProgressEnabled()) return
	const trackId = String(info.trackId ?? '')
	if (!trackId) return
	const position = Math.max(0, Number(info.position) || 0)
	const duration = Math.max(0, Number(info.duration) || 0)
	// 已经播完（剩不到 10 秒）就不必恢复
	if (duration > 0 && position > duration - 10) return
	try {
		PersistStatus.set('music.progressInfo', {
			trackId,
			platform: String(info.platform ?? ''),
			index: Math.max(0, Number(info.index) || 0),
			position,
			duration,
			savedAt: Date.now(),
		})
	} catch { /* ignore */ }
}

export const loadPlayProgress = (): SavedPlayProgress | null => {
	if (!isSaveProgressEnabled()) return null
	try {
		const raw: any = PersistStatus.get('music.progressInfo')
		if (!raw || typeof raw !== 'object') return null
		if (!raw.trackId) return null
		if (Date.now() - Number(raw.savedAt ?? 0) > MAX_AGE_MS) return null
		const position = Number(raw.position)
		if (!Number.isFinite(position) || position <= 1) return null
		return {
			trackId: String(raw.trackId),
			platform: String(raw.platform ?? ''),
			index: Math.max(0, Number(raw.index) || 0),
			position,
			duration: Math.max(0, Number(raw.duration) || 0),
			savedAt: Number(raw.savedAt ?? 0),
		}
	} catch {
		return null
	}
}

export const clearPlayProgress = () => {
	try { PersistStatus.set('music.progressInfo', null) } catch { /* ignore */ }
}

export const logSavedProgress = (saved: SavedPlayProgress) => {
	logInfo('[progress] restore', saved.trackId, 'pos=', Math.round(saved.position), 'dur=', Math.round(saved.duration))
}

export default { savePlayProgress, loadPlayProgress, clearPlayProgress, isSaveProgressEnabled }
