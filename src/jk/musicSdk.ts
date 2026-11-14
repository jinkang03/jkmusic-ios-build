// 确保 Buffer / TextEncoder 在任何 musicSdk 模块求值前就绪
import '@/shims/globalPolyfills'
/**
 * JKMUSIC 多源 SDK 的 RN 封装。
 * 桌面版这里是 @renderer/utils/musicSdk + @renderer/store；这里改成直接调用 SDK，
 * 数据形状保持 LX.Music.MusicInfo，方便与 Cymusic 的 UI 层对接。
 */
import musicSdk from '@/components/utils/musicSdk'

import * as wyApi from './wyApi'

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

// wy 的 weapi 通道被服务端风控（零参数 POST 也返回空 body），但公开 GET 接口可用。
// 首次 SDK 失败后记到 set 里，后续直接走公开接口，避免每次都先等 3 次重试。
/**
 * 曲目归一化：各源返回的字段名不统一（kw 用 songmid、kg 用 hash、mg 用 copyrightId、
 * wy/tx 用 id），而取播放地址时脚本要的是「元数据里的 songmid」。
 * 所有返回曲目的入口都必须过这个函数，否则会出现「能显示但播放只有 15 秒」这种
 * songmid 为空、脚本退化成试听片段的症状。
 */
// getBoards 返回的 id 形如 "kw__93"，但 leaderboard.getList 要纯数字 "93"。
// 带前缀会 0 条或 try max num（四源实测）。
const stripBoardId = (source: JKSource, id: string, board?: any) => {
	const bangid = board?.bangid ?? board?.bangId
	if (bangid != null && String(bangid).length) return String(bangid)
	return String(id ?? '').replace(new RegExp(`^${source}__`), '')
}

const normalizeMusic = (raw: any, source: JKSource): JKMusic => {
	const meta = { ...(raw?.meta ?? {}), ...raw }
	const id = String(
		raw?.id ?? raw?.songmid ?? raw?.songId ?? raw?.copyrightId ?? raw?.hash ?? ''
	)
	return {
		id,
		name: raw?.name ?? raw?.title ?? '',
		singer: raw?.singer ?? raw?.artist ?? '',
		source: (raw?.source ?? source) as JKSource,
		interval: raw?.interval ?? null,
		meta: { ...meta, songmid: raw?.songmid ?? id, source },
	}
}

const wySdkFailed = new Set<string>()

const wyFallback = async<T>(op: string, sdkFn: () => Promise<T>, fallbackFn: () => Promise<T>): Promise<T> => {
  if (wySdkFailed.has(op)) return fallbackFn()
  try {
    return await sdkFn()
  } catch (sdkErr: any) {
    console.log(`[jk/wy] fallback -> public api (${op})`, 'sdk error:', sdkErr?.message ?? sdkErr)
    wySdkFailed.add(op)
    try {
      return await fallbackFn()
    } catch (fbErr: any) {
      console.log(`[jk/wy] fallback failed (${op})`, 'fallback error:', fbErr?.message ?? fbErr)
      throw fbErr
    }
  }
}

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
	if (source === 'wy') {
		const res = await wyFallback('search', async() => {
			if (!mod?.musicSearch?.search) throw new Error('wy musicSearch 不可用')
			return mod.musicSearch.search(name, page, limit)
		}, async() => wyApi.wySearch(name, page, limit))
		return (res?.list ?? []).map((music: any) => normalizeMusic(music, source))
	}
	if (!mod?.musicSearch?.search) throw new Error(`${source} 不支持搜索`)
	const res = await mod.musicSearch.search(name, page, limit)
	return (res?.list ?? []).map((music: any) => normalizeMusic(music, source))
}

/** 榜单列表 */
export const getBoards = async(source: JKSource) => {
	const mod: any = (musicSdk as any)[source]
	if (source === 'wy') {
		const list = await wyFallback('boards', async() => {
			if (!mod?.leaderboard?.getBoards) throw new Error('wy leaderboard 不可用')
			const r = await mod.leaderboard.getBoards()
			const arr = r?.list ?? r ?? []
			if (!(arr.length > 0)) throw new Error('wy getBoards 返回空列表')
			return arr
		}, async() => {
			const boards = await wyApi.wyBoards()
			return boards.map((b: any) => ({ id: b.id, name: b.name, source }))
		})
		return (list ?? []).map((board: any) => ({ id: board.id, name: board.name, source }))
	}
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
	if (source === 'wy') {
		const res: any = await wyFallback('boardDetail', async() => {
			if (!mod?.leaderboard?.getList) throw new Error('wy leaderboard.getList 不可用')
			const r = await mod.leaderboard.getList(stripBoardId(source, id), page)
			if (!(r?.list?.length > 0)) throw new Error('wy leaderboard.getList 返回空列表')
			return r
		}, async() => wyApi.wyBoardDetail(stripBoardId(source, id), page))
		return {
			list: (res?.list ?? []).map((music: any) => normalizeMusic(music, source)),
			total: res?.total ?? res?.list?.length ?? 0,
			page,
		}
	}
	if (!mod?.leaderboard?.getList) throw new Error(`${source} 不支持榜单`)
	const res = await mod.leaderboard.getList(stripBoardId(source, id), page)
	return {
		list: (res?.list ?? []).map((music: any) => normalizeMusic(music, source)),
		total: res?.total ?? 0,
		page: res?.page ?? page,
	}
}

/** 歌单标签 */
export const getSongListTags = async(source: JKSource) => {
	const mod: any = (musicSdk as any)[source]
	if (source === 'wy') {
		return wyFallback('tags', async() => {
			if (!mod?.songList?.getTags) throw new Error('wy songList.getTags 不可用')
			const r = await mod.songList.getTags()
			if (!(r?.tags?.length > 0)) throw new Error('wy getTags 返回空')
			return r
		}, async() => wyApi.wySongListTags())
	}
	if (!mod?.songList?.getTags) return null
	return mod.songList.getTags()
}

/** 歌单列表 */
export const getSongLists = async(source: JKSource, options: { tagId?: string, sortId?: string, page?: number } = {}) => {
	const mod: any = (musicSdk as any)[source]
	if (source === 'wy') {
		return wyFallback('songLists', async() => {
			if (!mod?.songList?.getList) throw new Error('wy songList.getList 不可用')
			const r = await mod.songList.getList(options.sortId ?? 'new', options.tagId ?? '', options.page ?? 1)
			// weapi 被风控时可能「成功」但返回空列表，这种情况也要走兜底
			if (!(r?.list?.length > 0)) throw new Error('wy songList.getList 返回空列表')
			return r
		}, async() => wyApi.wySongLists(options))
	}
	if (!mod?.songList?.getList) throw new Error(`${source} 不支持歌单`)
	// 五个源统一是位置参数且 sortId 在前：getList(sortId, tagId, page, tryNum?)
	// 传对象会导致 tagId/sortId 全部落空，接口返回空列表（歌单页永远空）
	const res = await mod.songList.getList(
		options.sortId ?? 'new',
		options.tagId ?? '',
		options.page ?? 1,
	)
	return res
}

/** 歌单详情 */
export const getSongListDetail = async(source: JKSource, id: string, page = 1) => {
	const mod: any = (musicSdk as any)[source]
	if (source === 'wy') {
		const res: any = await wyFallback('songListDetail', async() => {
			if (!mod?.songList?.getListDetail) throw new Error('wy getListDetail 不可用')
			const r = await mod.songList.getListDetail(id, page)
			if (!(r?.list?.length > 0)) throw new Error('wy getListDetail 返回空列表')
			return r
		}, async() => wyApi.wySongListDetail(id, page))
		return res
	}
	if (!mod?.songList?.getListDetail) throw new Error(`${source} 不支持歌单详情`)
	const res: any = await mod.songList.getListDetail(id, page)
	return {
		...res,
		list: (res?.list ?? res?.musicList ?? []).map((music: any) => normalizeMusic(music, source)),
		total: res?.total ?? res?.list?.length ?? 0,
		page,
	}
}

/** 歌词 */
export const getLyric = async(music: JKMusic) => {
	const mod: any = (musicSdk as any)[music.source]
	if (music.source === 'wy') {
		return wyFallback('lyric', async() => {
			if (!mod?.getLyric) throw new Error('wy getLyric 不可用')
			const req: any = mod.getLyric(music, true)
			return req && typeof req.then === 'function' ? await req : await (req?.promise ?? req)
		}, async() => wyApi.wyLyric(String((music as any).meta?.songmid ?? music.id)))
	}
	if (!mod?.getLyric) throw new Error('歌词接口不可用')
	// 各源返回形态不一致：kw/kg/wy 返回 { promise }，mg 返回 Promise，tx 经过包装
	// 各源歌词接口要的是顶层 songmid/hash/copyrightId，而 JKMusic 把这些放在 meta 里。
	// normalizeMusic 不写 meta.raw，所以这里必须把 meta 摊平到顶层（meta 在后，覆盖同名键）
	const flat: any = { ...(music as any), ...((music.meta as any) ?? {}) }
	const target: any = (music.meta as any)?.raw ?? flat
	const req: any = mod.getLyric(target, true)
	const res = req && typeof req.then === 'function' ? await req : await (req?.promise ?? req)
	return res
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
