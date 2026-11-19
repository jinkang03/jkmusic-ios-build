/**
 * 同曲多源索引：把搜到的「歌名+歌手 → 各源 id」记下来，
 * 换源兜底时先查索引直接取流，省掉实时搜索的 3-10 秒。
 */
import PersistStatus from '@/store/PersistStatus'
import { logInfo } from '@/helpers/logger'

export type CrossSource = 'kw' | 'wy' | 'tx' | 'kg' | 'mg'
type Entry = { source: CrossSource, id: string, name: string, singer: string, at: number }

const KEY = 'music.crossSourceIndex'
const MAX_KEYS = 300
const MAX_PER_KEY = 4

const normalize = (v: any) => String(v ?? '').toLowerCase().replace(/[\s\-_·・,，.。()（）]/g, '')

export const keyOf = (name: any, singer: any) => `${normalize(name)}|${normalize(singer)}`

let map: Record<string, Entry[]> = {}
let loaded = false
let persistTimer: any = null

const load = () => {
	if (loaded) return
	loaded = true
	try {
		const raw = PersistStatus.get(KEY as any)
		if (raw && typeof raw === 'object') map = raw as any
	} catch { /* ignore */ }
}

const persistSoon = () => {
	if (persistTimer) return
	persistTimer = setTimeout(() => {
		persistTimer = null
		try {
			const keys = Object.keys(map)
			if (keys.length > MAX_KEYS) {
				// 超限丢最旧：按每条里最新 at 排序
				keys.sort((a, b) => Math.max(...(map[b].map(e => e.at) ?? [0])) - Math.max(...(map[a].map(e => e.at) ?? [0])))
				for (const k of keys.slice(MAX_KEYS)) delete map[k]
			}
			PersistStatus.set(KEY as any, map as any)
		} catch { /* ignore */ }
	}, 2000)
}

export const remember = (list: any[]) => {
	load()
	let added = 0
	for (const item of list ?? []) {
		const id = String(item?.id ?? '')
		const source = String(item?.source ?? '') as CrossSource
		if (!id || !source) continue
		const k = keyOf(item?.name ?? item?.title, item?.singer ?? item?.artist)
		if (k === '|') continue
		const arr = map[k] ?? []
		const next = arr.filter(e => e.source !== source)
		next.push({ source, id, name: String(item?.name ?? item?.title ?? ''), singer: String(item?.singer ?? item?.artist ?? ''), at: Date.now() })
		map[k] = next.slice(-MAX_PER_KEY)
		added++
	}
	if (added) { persistSoon(); logInfo('[xsource] remember n=', added, 'keys=', Object.keys(map).length) }
	return added
}

export const lookup = (name: any, singer: any): Entry[] => {
	load()
	return map[keyOf(name, singer)] ?? []
}

export const clear = () => {
	map = {}
	try { PersistStatus.set(KEY as any, {} as any) } catch { /* ignore */ }
	logInfo('[xsource] cleared')
}

export const stats = () => {
	load()
	return { keys: Object.keys(map).length }
}

export default { remember, lookup, clear, keyOf, stats }
