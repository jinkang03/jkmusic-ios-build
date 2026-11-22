import { logInfo, logError } from '@/helpers/logger'
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
	// kg 的取流 id 是 hash（FileHash），songmid 是 Audioid —— 脚本只吃 songmid，必须换成 hash
	const pickId = () => {
		if (source === 'kg') return raw?.hash ?? raw?.songmid ?? raw?.id ?? ''
		return raw?.id ?? raw?.songmid ?? raw?.songId ?? raw?.copyrightId ?? raw?.hash ?? ''
	}
	const id = String(pickId())
	if (source === 'kg') logInfo('[source] kg id=', String(id).slice(0, 12), 'hash=', String(raw?.hash ?? '').slice(0, 12), 'songmid=', String(raw?.songmid ?? '').slice(0, 12))
	return {
		id,
		name: raw?.name ?? raw?.title ?? '',
		singer: raw?.singer ?? raw?.artist ?? '',
		source: (raw?.source ?? source) as JKSource,
		interval: raw?.interval ?? null,
		meta: { ...meta, songmid: source === 'kg' ? id : (raw?.songmid ?? id), hash: raw?.hash ?? meta.hash, source },
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
	void import('./crossSourceIndex').then(m => {
		for (const g of lists ?? []) m.remember(g?.list ?? [])
	}).catch(() => undefined)
	return lists
		.filter(item => Array.isArray(item?.list) && item.list.length)
		.map(item => ({
			source: item.source as JKSource,
			// 用统一的 normalizeMusic，避免手写映射丢掉 albumName 等顶层字段（P108 发现聚合结果专辑列为空）
			list: item.list.map((music: any): JKMusic => normalizeMusic(music, (music.source ?? item.source) as JKSource)),
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
	// tx 搜索间歇失败（脚本/上游限流），重试 2 次（400ms / 800ms）
	const attempt = async(n: number): Promise<any> => {
		try {
			return await mod.musicSearch.search(name, page, limit)
		} catch (err) {
			if (source !== 'tx' || n >= 2) throw err
			const wait = n === 0 ? 400 : 800
			logError('[search] tx retry', 'attempt=' + (n + 1), 'wait=' + wait, String((err as any)?.message ?? err))
			await new Promise(r => setTimeout(r, wait))
			return attempt(n + 1)
		}
	}
	let res: any
	try {
		res = await attempt(0)
	} catch (err) {
		if (source === 'tx') {
			logError('[search] tx failed after retry', String((err as any)?.message ?? err))
			return []
		}
		throw err
	}
	const normalized = (res?.list ?? []).map((music: any) => normalizeMusic(music, source))
	void import('./crossSourceIndex').then(m => m.remember(normalized)).catch(() => undefined)
	return normalized
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
		// 关键：wy 的 SDK 返回条目只有 songmid、没有 id，必须统一归一化。
		// 否则导入后每首歌 id 都是 undefined → 点任意一首都被当成「当前曲」，
		// 而且缓存 key 全变成 wy:undefined → 播一首就整列打勾。
		const list = (res?.list ?? res?.musicList ?? []).map((music: any) => normalizeMusic(music, 'wy'))
		return {
			...res,
			list,
			total: res?.total ?? list.length,
			page,
		}
	}
	if (!mod?.songList?.getListDetail) throw new Error(`${source} 不支持歌单详情`)
	let res: any
	try {
		res = await mod.songList.getListDetail(id, page)
	} catch (err) {
		// tx 的 disstid 接口对部分歌单稳定报 try max num：
		// 用另一套公开接口（fcg_v8_playlist_cp）兜底，导入/更新都走这里
		if (source !== 'tx') throw err
		// fcg_v8_playlist_cp 一次返回整张歌单（最多 1000 首），不支持分页：
		// 第 1 页返回全部，后续页返回空，避免导入循环把同一页重复 push
		if (page > 1) return { list: [], total: 0, page, info: {} }
		const { getPlayListFromQ } = await import('@/helpers/userApi/getMusicSource')
		const resp: any = await getPlayListFromQ(id)
		const songs: any[] = resp?.songs ?? []
		if (!songs.length) throw err
		const list = songs.map((s: any) => normalizeMusic({
			id: String(s.id ?? ''),
			name: String(s.title ?? ''),
			singer: String(s.artist ?? ''),
			source: 'tx',
			interval: s.duration ? String(s.duration) : null,
			songmid: String(s.id ?? ''),
			albumName: String(s.album ?? ''),
			picUrl: String(s.artwork ?? ''),
		}, 'tx'))
		logInfo('[musicSdk] tx 歌单兜底(fcg_v8_playlist_cp)', id, 'count=', list.length)
		return { list, total: list.length, page, info: { name: String(resp?.name ?? '') } }
	}
	const normalizedList = (res?.list ?? res?.musicList ?? []).map((music: any) => normalizeMusic(music, source))
	void import('./crossSourceIndex').then(m => m.remember(normalizedList)).catch(() => undefined)
	return {
		...res,
		list: normalizedList,
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

/**
 * 热门搜索（包装 kw 的 hotSearch 导出，不改 SDK 内部实现）
 * 30 分钟内存缓存
 */
let hotSearchCache: { at: number, words: string[] } | null = null
export const getHotSearch = async(): Promise<string[]> => {
	const now = Date.now()
	// 强制失败开关必须在缓存判断之前，否则缓存命中后永远走不到（P108 实测）
	try {
		const { getSetting: gs } = await import('./settingsStore')
		if (gs<boolean>('_dev.hotFail', false)) {
			logError('[hotsearch] 强制失败（_dev.hotFail）')
			return []
		}
	} catch { /* ignore */ }
	if (hotSearchCache && now - hotSearchCache.at < 30 * 60 * 1000) return hotSearchCache.words
	try {
		const mod: any = (musicSdk as any).kw
		let list: any[] = []
		if (mod?.hotSearch?.getList) {
			const res: any = await mod.hotSearch.getList()
			list = res?.list ?? []
		}
		const words = list.map((x: any) => (typeof x === 'string' ? x : x?.name ?? '')).filter(Boolean).slice(0, 12)
		hotSearchCache = { at: now, words }
		logInfo('[hotsearch] ok count=' + words.length)
		return words
	} catch (err) {
		logError('[hotsearch] failed', String((err as any)?.message ?? err))
		return []
	}
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
