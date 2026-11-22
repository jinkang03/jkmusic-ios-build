import { logInfo } from '@/helpers/logger'
/**
 * JKMUSIC 的列表模型（试听列表 / 我的收藏 / 用户列表 / 不喜欢），
 * 持久化到 MMKV，键名与桌面版语义一致。
 */
import getOrCreateMMKV from '@/store/getOrCreateMMKV'
import { GlobalState } from '@/utils/stateMapper'
import type { JKMusic, JKSource } from './musicSdk'

export const LIST_IDS = {
	DEFAULT: 'default',
	LOVE: 'love',
	TEMP: 'temp',
} as const

export interface JkUserList {
	id: string
	name: string
	source?: string
	sourceListId?: string
	locationUpdateTime?: number
	list: JKMusic[]
}

const createSafeStore = () => {
	try {
		return getOrCreateMMKV('jk_library')
	} catch (err) {
		console.log('[jk/libraryStore] MMKV 不可用，使用内存存储', err)
		const memory = new Map<string, string>()
		return {
			getString: (key: string) => memory.get(key),
			set: (key: string, value: string) => { memory.set(key, value) },
			delete: (key: string) => { memory.delete(key) },
		} as any
	}
}

const store = createSafeStore()
const KEY_LISTS = 'lists'
const KEY_DISLIKE = 'dislike'

const readJSON = <T,>(key: string, fallback: T): T => {
	const raw = store.getString(key)
	if (!raw) return fallback
	try {
		return JSON.parse(raw) as T
	} catch {
		return fallback
	}
}

const writeJSON = (key: string, value: unknown) => {
	store.set(key, JSON.stringify(value))
}

/** 列表数据版本号：写入后递增，UI 用它触发重渲染（收藏图标等） */
export const libraryVersionStore = new GlobalState<number>(0)
const bumpLibraryVersion = () => libraryVersionStore.setValue(libraryVersionStore.getValue() + 1)

const state = {
	defaultList: readJSON<JKMusic[]>(`${KEY_LISTS}:default`, []),
	loveList: readJSON<JKMusic[]>(`${KEY_LISTS}:love`, []),
	userLists: readJSON<JkUserList[]>(`${KEY_LISTS}:user`, []),
	dislike: readJSON<string[]>(KEY_DISLIKE, []),
}

export const getDefaultList = () => state.defaultList
export const getLoveList = () => state.loveList
export const getUserLists = () => state.userLists
export const getDislikeRules = () => state.dislike

export const setDefaultList = (list: JKMusic[]) => {
	state.defaultList = list
	bumpLibraryVersion()
	writeJSON(`${KEY_LISTS}:default`, list)
}

export const setLoveList = (list: JKMusic[]) => {
	state.loveList = list
	bumpLibraryVersion()
	writeJSON(`${KEY_LISTS}:love`, list)
}

export const setUserLists = (lists: JkUserList[]) => {
	state.userLists = lists
	bumpLibraryVersion()
	writeJSON(`${KEY_LISTS}:user`, lists)
}

export const createUserList = (name: string): JkUserList => {
	const list: JkUserList = {
		id: `user_${Date.now().toString(36)}`,
		name: name.trim() || '新建列表',
		list: [],
	}
	setUserLists([...state.userLists, list])
	return list
}

export const removeUserList = (id: string) => {
	const next = state.userLists.filter(item => item.id !== id)
	setUserLists(next)
	logInfo('[library] removeList id=', id, 'remain=', next.length)
}

export const renameUserList = (id: string, name: string) => {
	setUserLists(state.userLists.map(item => (item.id === id ? { ...item, name } : item)))
}

const sameMusic = (a: JKMusic, b: JKMusic) => a.id === b.id && a.source === b.source

export const getListName = (id: string): string => {
	if (id === LIST_IDS.DEFAULT) return '试听列表'
	if (id === LIST_IDS.LOVE) return '我的收藏'
	return state.userLists.find(item => item.id === id)?.name ?? '试听'
}

export const getListById = (id: string): JKMusic[] => {
	if (id === LIST_IDS.DEFAULT) return state.defaultList
	if (id === LIST_IDS.LOVE) return state.loveList
	return state.userLists.find(item => item.id === id)?.list ?? []
}

export const addToList = (listId: string, musics: JKMusic[], position: 'top' | 'bottom' = 'bottom') => {
	const exist = getListById(listId)
	const filtered = musics.filter(m => !exist.some(item => sameMusic(item, m)))
	if (!filtered.length) return exist
	const next = position === 'top' ? [...filtered, ...exist] : [...exist, ...filtered]
	if (listId === LIST_IDS.DEFAULT) setDefaultList(next)
	else if (listId === LIST_IDS.LOVE) setLoveList(next)
	else setUserLists(state.userLists.map(item => (item.id === listId ? { ...item, list: next } : item)))
	return next
}

export const removeFromList = (listId: string, ids: string[]) => {
	const next = getListById(listId).filter(m => !ids.includes(m.id))
	if (listId === LIST_IDS.DEFAULT) setDefaultList(next)
	else if (listId === LIST_IDS.LOVE) setLoveList(next)
	else setUserLists(state.userLists.map(item => (item.id === listId ? { ...item, list: next } : item)))
	return next
}

/**
 * 换源：把「试听列表 / 我的收藏 / 所有自建歌单」里 source+id 匹配的曲目替换成新曲目。
 * 返回替换的条数（同一首可能被加到多个列表）。
 */
export const replaceSong = (oldMusic: JKMusic, newMusic: JKMusic): number => {
	let count = 0
	const mapList = (list: JKMusic[]) => list.map(item => {
		if (!sameMusic(item, oldMusic)) return item
		count++
		return newMusic
	})
	const nextDefault = mapList(state.defaultList)
	const nextLove = mapList(state.loveList)
	const nextUserLists = state.userLists.map(list => ({ ...list, list: mapList(list.list) }))
	if (count > 0) {
		setDefaultList(nextDefault)
		setLoveList(nextLove)
		setUserLists(nextUserLists)
	}
	return count
}

export const isInLoveList = (music: JKMusic) => state.loveList.some(item => sameMusic(item, music))

export const toggleLove = (music: JKMusic) => {
	if (isInLoveList(music)) {
		removeFromList(LIST_IDS.LOVE, [music.id])
		return false
	}
	addToList(LIST_IDS.LOVE, [music])
	return true
}

const dislikeKey = (music: JKMusic) => `${(music.name ?? '').trim()}@${(music.singer ?? '').trim()}`

export const setDislikeRules = (rules: string[]) => {
	state.dislike = rules
	writeJSON(KEY_DISLIKE, rules)
}

export const addDislike = (music: JKMusic) => {
	const key = dislikeKey(music)
	if (state.dislike.includes(key)) return false
	setDislikeRules([...state.dislike, key])
	return true
}

export const isDisliked = (music: JKMusic) => state.dislike.includes(dislikeKey(music))

export const clearDislike = () => setDislikeRules([])

/** 导出为桌面版兼容的备份结构 */
export const exportPlayListData = () => ({
	defaultList: state.defaultList,
	loveList: state.loveList,
	userList: state.userLists,
})

export const importPlayListData = (data: { defaultList?: JKMusic[], loveList?: JKMusic[], userList?: JkUserList[] }) => {
	if (Array.isArray(data.defaultList)) setDefaultList(data.defaultList)
	if (Array.isArray(data.loveList)) setLoveList(data.loveList)
	if (Array.isArray(data.userList)) setUserLists(data.userList)
}

export type { JKMusic, JKSource }

/**
 * 从来源平台重新拉取歌单内容并整体覆盖本地（对应 mac 端的「更新歌单」）。
 *
 * - 有 `sourceListId`：直接按 id 拉全部页；
 * - 没有（老数据/备份导入）：用歌单名去平台搜索同名歌单，命中后补上 id 再拉。
 * - 平台返回空时不动本地数据，避免把歌单清空。
 */
export const updateUserListFromSource = async(
	listId: string,
): Promise<{ ok: boolean, count: number, reason?: string, sourceListId?: string }> => {
	const target = state.userLists.find(item => item.id === listId)
	if (!target) return { ok: false, count: 0, reason: '歌单不存在' }
	const source = String(target.source ?? '') as any
	if (!source) {
		return { ok: false, count: 0, reason: '该歌单没有来源平台信息，请重新从平台导入' }
	}
	try {
		const sdk = await import('./musicSdk')
		// 只认「可追溯的歌单 id/链接」：不再用歌单名搜索（同名歌单会命中别人的）
		const sourceListId = await resolveSourceListId(String(target.sourceListId ?? ''))
		if (!sourceListId) {
			return {
				ok: false,
				count: 0,
				reason: '该歌单的来源是短链接，无法自动更新；请用含「id=」的完整歌单链接重新导入',
			}
		}
		const all: JKMusic[] = []
		for (let page = 1; page <= 20; page++) {
			const res: any = await sdk.getSongListDetail(source, sourceListId, page)
			const chunk: JKMusic[] = res?.list ?? []
			all.push(...chunk)
			if (chunk.length < 100) break
		}
		if (!all.length) return { ok: false, count: 0, reason: '平台返回空歌单', sourceListId }
		setUserLists(state.userLists.map(item => (
			item.id === listId
				? { ...item, source, sourceListId, list: all, locationUpdateTime: Date.now() }
				: item
		)))
		return { ok: true, count: all.length, sourceListId }
	} catch (err) {
		return { ok: false, count: 0, reason: String((err as any)?.message ?? err) }
	}
}

/**
 * 把「歌单链接」解析成平台可用的纯 id。
 * lxmc 备份里的 sourceListId 通常是完整链接（含短链），不能直接传给 getSongListDetail。
 */
export const resolveSourceListId = async(raw: string): Promise<string> => {
	const s = String(raw ?? '').trim()
	if (!s) return ''
	if (/^\d+$/.test(s)) return s
	const direct = s.match(/[?&]id=(\d+)/)
	if (direct) return direct[1]
	if (/^https?:/i.test(s)) {
		try {
			const res = await fetch(s, { method: 'GET' })
			const finalUrl = String((res as any)?.url ?? '')
			const m = finalUrl.match(/[?&]id=(\d+)/) ?? s.match(/[?&]id=(\d+)/)
			if (m) return m[1]
			// QQ 短链（.../u?__=xxx）返回的是 JS 落地页，服务端拿不到歌单 id。
			// 返回空让上层提示「请用含 id= 的完整链接重新导入」，而不是拿短链当 id 去请求。
			return ''
		} catch {
			return ''
		}
	}
	return s
}
