/**
 * 「已缓存」索引：给歌曲行打勾用。
 *
 * 数据源是 musicCache/index.json（downloadToCache 写入的元数据），
 * 用 `source:songmid` 作为 key，避免不同平台 id 撞车。
 * 换源下载的条目优先用 actualSource/actualId（真实来源）。
 */
import { GlobalState } from '@/utils/stateMapper'
import { readCacheIndex } from '@/player/CacheManager'
import { logInfo } from '@/helpers/logger'
import { getDownloadedKeys } from './downloadIndex'

export const cachedKeysStore = new GlobalState<Set<string>>(new Set())

const keyOf = (source: any, id: any) => `${String(source ?? '')}:${String(id ?? '')}`

export const isCachedKey = (source: any, id: any) => {
	const key = keyOf(source, id)
	return !!key && key !== ':' && cachedKeysStore.getValue().has(key)
}

export const markCached = (source: any, id: any) => {
	const key = keyOf(source, id)
	if (!key || key === ':') return
	const next = new Set(cachedKeysStore.getValue())
	if (next.has(key)) return
	next.add(key)
	cachedKeysStore.setValue(next)
	logInfo('[cache] 标记已缓存', key)
}

export const unmarkCached = (source: any, id: any) => {
	const key = keyOf(source, id)
	if (!key || key === ':') return
	const cur = cachedKeysStore.getValue()
	if (!cur.has(key)) return
	const next = new Set(cur)
	next.delete(key)
	cachedKeysStore.setValue(next)
}

/** 从 musicCache/index.json 重建整份索引（启动、清缓存后调用） */
export const refreshCachedKeys = async() => {
	try {
		const index = await readCacheIndex()
		const next = new Set<string>()
		for (const meta of Object.values(index ?? {})) {
			const anyMeta: any = meta
			const src = String(anyMeta?.actualSource ?? anyMeta?.source ?? '')
			const id = String(anyMeta?.actualId ?? anyMeta?.songmid ?? '')
			if (src && id) next.add(keyOf(src, id))
		}
		// 手动下载的也算「本地已有」：和已缓存用同一个标记，不区分来源
		for (const key of getDownloadedKeys()) next.add(key)
		cachedKeysStore.setValue(next)
		logInfo('[cache] 已缓存索引', next.size, '首')
	} catch { /* 索引不可读时保持空集合 */ }
}

export default { cachedKeysStore, isCachedKey, markCached, unmarkCached, refreshCachedKeys }
