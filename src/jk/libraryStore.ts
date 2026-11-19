import { logInfo } from '@/helpers/logger'
/**
 * JKMUSIC 的列表模型（试听列表 / 我的收藏 / 用户列表 / 不喜欢），
 * 持久化到 MMKV，键名与桌面版语义一致。
 */
import getOrCreateMMKV from '@/store/getOrCreateMMKV'
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
	writeJSON(`${KEY_LISTS}:default`, list)
}

export const setLoveList = (list: JKMusic[]) => {
	state.loveList = list
	writeJSON(`${KEY_LISTS}:love`, list)
}

export const setUserLists = (lists: JkUserList[]) => {
	state.userLists = lists
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
