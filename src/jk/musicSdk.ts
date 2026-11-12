/**
 * JKMUSIC 多源 SDK 的 RN 封装。
 * 桌面版这里是 @renderer/utils/musicSdk + @renderer/store；这里改成直接调用 SDK，
 * 数据形状保持 LX.Music.MusicInfo，方便与 Cymusic 的 UI 层对接。
 */
import musicSdk from '@/components/utils/musicSdk'

export type JKSource = 'kw' | 'kg' | 'tx' | 'wy' | 'mg' | 'local'

export interface JKMusic {
	id: string
	name: string
	singer: string
	source: JKSource
	interval: string | null
	meta: Record<string, any>
}

export const sources = musicSdk.sources as Array<{ id: JKSource, name: string }>

/** 全源搜索：返回每个源的一页结果 */
export const searchAllSources = async(name: string, page = 1, limit = 20) => {
	const lists = await musicSdk.searchMusic({ name, singer: '', source: '', limit })
	return lists
		.filter(item => Array.isArray(item?.list) && item.list.length)
		.map(item => ({
			source: item.source as JKSource,
			list: item.list.map((music: any): JKMusic => ({
				id: music.id ?? music.songmid ?? '',
				name: music.name ?? '',
				singer: music.singer ?? '',
				source: (music.source ?? item.source) as JKSource,
				interval: music.interval ?? null,
				meta: music.meta ?? {},
			})),
		}))
}

/** 单源搜索（分页） */
export const searchBySource = async(source: JKSource, name: string, page = 1, limit = 20) => {
	const mod: any = (musicSdk as any)[source]
	if (!mod?.musicSearch?.search) throw new Error(`${source} 不支持搜索`)
	const res = await mod.musicSearch.search(name, page, limit)
	return (res?.list ?? []).map((music: any): JKMusic => ({
		id: music.id ?? music.songmid ?? '',
		name: music.name ?? '',
		singer: music.singer ?? '',
		source: (music.source ?? source) as JKSource,
		interval: music.interval ?? null,
		meta: music.meta ?? {},
	}))
}

/** 榜单列表 */
export const getBoards = async(source: JKSource) => {
	const mod: any = (musicSdk as any)[source]
	if (!mod?.leaderboard?.getBoards) return []
	const res = await mod.leaderboard.getBoards()
	return (res?.list ?? res ?? []).map((board: any) => ({
		id: board.id,
		name: board.name,
		source,
	}))
}

/** 榜单详情 */
export const getBoardDetail = async(source: JKSource, id: string, page = 1) => {
	const mod: any = (musicSdk as any)[source]
	if (!mod?.leaderboard?.getList) throw new Error(`${source} 不支持榜单`)
	const res = await mod.leaderboard.getList(id, page)
	return {
		list: (res?.list ?? []).map((music: any): JKMusic => ({
			id: music.id ?? '',
			name: music.name ?? '',
			singer: music.singer ?? '',
			source,
			interval: music.interval ?? null,
			meta: music.meta ?? {},
		})),
		total: res?.total ?? 0,
		page: res?.page ?? page,
	}
}

/** 歌单标签 */
export const getSongListTags = async(source: JKSource) => {
	const mod: any = (musicSdk as any)[source]
	if (!mod?.songList?.getTags) return null
	return mod.songList.getTags()
}

/** 歌单列表 */
export const getSongLists = async(source: JKSource, options: { tagId?: string, sortId?: string, page?: number } = {}) => {
	const mod: any = (musicSdk as any)[source]
	if (!mod?.songList?.getList) throw new Error(`${source} 不支持歌单`)
	const res = await mod.songList.getList({
		tagId: options.tagId ?? '',
		sortId: options.sortId ?? 'new',
		page: options.page ?? 1,
	})
	return res
}

/** 歌单详情 */
export const getSongListDetail = async(source: JKSource, id: string, page = 1) => {
	const mod: any = (musicSdk as any)[source]
	if (!mod?.songList?.getListDetail) throw new Error(`${source} 不支持歌单详情`)
	return mod.songList.getListDetail(id, page)
}

/** 歌词 */
export const getLyric = async(music: JKMusic) => {
	const mod: any = (musicSdk as any)[music.source]
	if (!mod?.getLyric) throw new Error('歌词接口不可用')
	return mod.getLyric(music, false)
}

export default {
	sources,
	searchAllSources,
	searchBySource,
	getBoards,
	getBoardDetail,
	getSongListTags,
	getSongLists,
	getSongListDetail,
	getLyric,
}
