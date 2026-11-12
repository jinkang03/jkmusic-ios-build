// helpers/searchAll.ts
// 搜索改用 JKMUSIC 全量 musicSdk：kw / kg / tx / wy / mg 多源并行
import { searchAllSources, searchBySource, sources } from '@/jk/musicSdk'
import { jkToTrack } from '@/jk/adapt'
import type { Track } from '@/player/types'

const PAGE_SIZE = 20

type SearchType = 'songs' | 'artists'

export const searchableSources = sources

const searchArtistsFallback = async(searchText: string, page: number) => {
	const { searchArtist } = await import('@/helpers/userApi/xiaoqiu')
	return searchArtist(searchText, page)
}

const searchAll = async(
	searchText: string,
	page: number = 1,
	type: SearchType = 'songs',
): Promise<{ data: Track[]; hasMore: boolean }> => {
	if (type === 'artists') {
		const result = await searchArtistsFallback(searchText, page)
		const data = (result.data ?? []).map((artist: any) => ({
			id: artist.id,
			platform: 'tx',
			title: artist.name,
			artist: artist.name,
			artwork: artist.avatar,
			isArtist: true,
		})) as Track[]
		return { data, hasMore: data.length === PAGE_SIZE }
	}

	const lists = await searchAllSources(searchText, page, PAGE_SIZE)
	const data: Track[] = []
	for (const group of lists) {
		for (const music of group.list) data.push(jkToTrack(music))
	}
	return { data, hasMore: data.length >= PAGE_SIZE }
}

/** 指定源搜索 */
export const searchInSource = async(
	source: string,
	searchText: string,
	page = 1,
): Promise<{ data: Track[]; hasMore: boolean }> => {
	const list = await searchBySource(source as any, searchText, page, PAGE_SIZE)
	const data = list.map(jkToTrack)
	return { data, hasMore: data.length === PAGE_SIZE }
}

export default searchAll
