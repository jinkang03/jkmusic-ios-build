/**
 * 网易云公开接口兜底。
 *
 * 背景：wy 的 weapi（加密 POST）通道被服务端风控，零业务参数也返回空 body，
 * 但公开 GET 接口在同一时刻全部可用（/api/search/get/web、/api/toplist、
 * /api/playlist/list、/api/playlist/detail、/api/song/lyric、/api/playlist/catalogue）。
 * 所以这里不改 musicSdk 内部，直接在 src/jk 下做一层兜底实现。
 */
import type { JKMusic, JKSource } from './musicSdk'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const BASE = 'https://music.163.com'

const headers = {
  'User-Agent': UA,
  'Referer': 'https://music.163.com/',
}

const getJSON = async(url: string) => {
  const res = await fetch(url, { headers })
  const text = await res.text()
  if (!text) throw new Error('empty body from ' + url)
  return JSON.parse(text)
}

const toJKMusic = (song: any): JKMusic => ({
  id: String(song.id),
  name: song.name ?? '',
  singer: (song.ar ?? song.artists ?? []).map((a: any) => a.name).join('/'),
  source: 'wy' as JKSource,
  interval: song.dt ? String(Math.floor(song.dt / 1000)) : (song.duration ? String(Math.floor(song.duration / 1000)) : null),
  meta: {
    songmid: String(song.id),
    picUrl: song.al?.picUrl ?? song.album?.picUrl ?? '',
    albumName: song.al?.name ?? song.album?.name ?? '',
  },
})

/** 搜索 */
export const wySearch = async(name: string, page = 1, limit = 30) => {
  const offset = (page - 1) * limit
  const url = `${BASE}/api/search/get/web?s=${encodeURIComponent(name)}&type=1&limit=${limit}&offset=${offset}`
  const data = await getJSON(url)
  const songs = data?.result?.songs ?? []
  const list: JKMusic[] = songs.map((song: any) => ({
    id: String(song.id),
    name: song.name ?? '',
    singer: (song.artists ?? []).map((a: any) => a.name).join('/'),
    source: 'wy' as JKSource,
    interval: song.duration ? String(Math.floor(song.duration / 1000)) : null,
    meta: {
      songmid: String(song.id),
      picUrl: song.album?.picUrl ?? '',
      albumName: song.album?.name ?? '',
    },
  }))
  return { list, total: data?.result?.songCount ?? list.length, page, limit }
}

/** 歌单标签（热门分类目录） */
export const wySongListTags = async() => {
  const data = await getJSON(`${BASE}/api/playlist/catalogue`)
  const subs: any[] = data?.sub ?? []
  const groups = new Map<string, Array<{ id: string, name: string }>>()
  for (const item of subs) {
    const category = item.category ?? '其它'
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category)!.push({ id: String(item.name), name: String(item.name) })
  }
  const tags = Array.from(groups.entries()).map(([name, list]) => ({ name, list }))
  return { tags, hotTag: [], source: 'wy' as JKSource }
}

/** 歌单列表 */
export const wySongLists = async(options: { tagId?: string, sortId?: string, page?: number } = {}) => {
  const page = options.page ?? 1
  const limit = 25
  const cat = options.tagId || '全部'
  // 实测 order=new 会返回 0 条（该参数已失效），只有 hot 有效
  const order = 'hot'
  const url = `${BASE}/api/playlist/list?cat=${encodeURIComponent(cat)}&limit=${limit}&offset=${(page - 1) * limit}&order=${order}`
  const data = await getJSON(url)
  const playlists: any[] = data?.playlists ?? []
  return {
    list: playlists.map(item => ({
      id: String(item.id),
      name: item.name ?? '',
      img: item.coverImgUrl ?? '',
      playCount: item.playCount,
      total: item.trackCount,
      author: item.creator?.nickname ?? '',
    })),
    total: data?.total ?? playlists.length,
    page,
    limit,
  }
}

/** 歌单详情（榜单 id 同样适用） */
export const wySongListDetail = async(id: string, page = 1) => {
  const data = await getJSON(`${BASE}/api/playlist/detail?id=${encodeURIComponent(id)}`)
  const pl = data?.playlist ?? {}
  const tracks: any[] = pl.tracks ?? []
  return {
    info: {
      id: String(pl.id ?? id),
      name: pl.name ?? '',
      img: pl.coverImgUrl ?? '',
      desc: pl.description ?? '',
      author: pl.creator?.nickname ?? '',
      total: pl.trackCount ?? tracks.length,
    },
    list: tracks.map(toJKMusic),
    page,
  }
}

/** 榜单列表 */
export const wyBoards = async() => {
  const data = await getJSON(`${BASE}/api/toplist`)
  const list: any[] = data?.list ?? []
  return list.map((item: any) => ({
    id: String(item.id),
    name: item.name ?? '',
    source: 'wy' as JKSource,
    img: item.coverImgUrl ?? '',
    desc: item.updateFrequency ?? '',
  }))
}

/** 榜单详情 */
export const wyBoardDetail = async(id: string, page = 1) => wySongListDetail(id, page)

/** 歌词（保留时间轴行） */
export const wyLyric = async(songmid: string | number) => {
  const data = await getJSON(`${BASE}/api/song/lyric?id=${songmid}&lv=-1&kv=-1&tv=-1`)
  return {
    lyric: data?.lrc?.lyric ?? '',
    tlyric: data?.tlyric?.lyric ?? null,
  }
}

export default {
  wySearch,
  wySongListTags,
  wySongLists,
  wySongListDetail,
  wyBoards,
  wyBoardDetail,
  wyLyric,
}
