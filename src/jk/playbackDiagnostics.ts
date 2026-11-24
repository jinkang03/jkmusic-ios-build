/**
 * 播放诊断：记录最近 50 次「失败 / 换源 / 停住 / 崩溃」，供设置里的「播放诊断」页查看。
 *
 * 目的：把「为什么换源」从日志里搬到用户能看到的地方，
 * 避免「音源测试通过、播放却换源」这种看不懂的情况。
 */
import { GlobalState } from '@/utils/stateMapper'
import getOrCreateMMKV from '@/store/getOrCreateMMKV'

export type PlaybackDiagKind = 'switch' | 'halt' | 'fail' | 'crash'

export type PlaybackDiagEntry = {
	/** 时间戳 */
	at: number
	kind: PlaybackDiagKind
	/** 曲名 */
	title: string
	/** 原平台 */
	from: string
	/** 换到的平台（switch 才有） */
	to?: string
	/** 原因：起播超时 / 播放停滞 / 试听片段 / 播放出错 / 取流失败 */
	reason: string
	/** 附加信息（HTTP 状态、错误消息、地址片段） */
	detail?: string
}

const STORE_KEY = 'entries_v1'
const MAX_ENTRIES = 50

let store: any = null
const getStore = () => {
	if (!store) {
		try {
			store = getOrCreateMMKV('jk_playback_diag')
		} catch {
			const memory = new Map<string, string>()
			store = {
				getString: (k: string) => memory.get(k),
				set: (k: string, v: string) => { memory.set(k, v) },
			}
		}
	}
	return store
}

const load = (): PlaybackDiagEntry[] => {
	try {
		const raw = getStore().getString(STORE_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : []
	} catch {
		return []
	}
}

export const playbackDiagnosticsStore = new GlobalState<PlaybackDiagEntry[]>(load())

const persist = (list: PlaybackDiagEntry[]) => {
	try {
		getStore().set(STORE_KEY, JSON.stringify(list))
	} catch { /* ignore */ }
}

export const recordDiagnostic = (entry: Omit<PlaybackDiagEntry, 'at'>) => {
	try {
		const next = [{ ...entry, at: Date.now() }, ...playbackDiagnosticsStore.getValue()].slice(0, MAX_ENTRIES)
		persist(next)
		playbackDiagnosticsStore.setValue(next)
	} catch { /* 诊断失败不影响播放 */ }
}

export const clearDiagnostics = () => {
	try {
		persist([])
		playbackDiagnosticsStore.setValue([])
	} catch { /* ignore */ }
}

export default { playbackDiagnosticsStore, recordDiagnostic, clearDiagnostics }
