/**
 * 歌单页：标签 + 排序 + 分页列表，数据来自 JKMUSIC musicSdk。
 *
 * 布局约束（重要）：两个横向 ScrollView 必须 flexGrow:0 / flexShrink:0，
 * 否则 RN 的 ScrollView 默认 flexGrow:1 会吃掉剩余高度，标签被拉成竖长条、FlatList 被挤没。
 * 分页约束：只有 loading=false 且 hasMore=true 且已有数据时才继续翻页，
 * 避免空列表触底后无限请求（发热/流量放大器）。
 */
import { useAppTheme } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'
import { logInfo } from '@/helpers/logger'
import { getSongLists, getSongListTags, sources } from '@/jk/musicSdk'
import type { JKSource } from '@/jk/musicSdk'
import SongListCard from '@/components/mac/SongListCard'
import StateView from '@/components/mac/StateView'
import i18n from '@/utils/i18n'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { sourceLabel } from '@/jk/sourceLabels'
import { tr } from '@/utils/i18n'
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const LIST_SOURCES: JKSource[] = ['kw', 'kg', 'tx', 'wy', 'mg']
const PAGE_SIZE_GUESS = 30

interface SongListItem {
	id: string
	name: string
	img?: string
	desc?: string
	author?: string
	playCount?: string
	total?: number
}

const SongListScreen = () => {
	const { colors } = useAppTheme()
	const router = useRouter()
	// 深链参数只作为首次挂载的初始值（jkmusic://songlist?source=wy），之后仍由用户操作控制
	const params = useLocalSearchParams<{ source?: string }>()
	const initialSource = (LIST_SOURCES as string[]).includes(String(params.source))
		? (params.source as JKSource)
		: 'kw'
	const insets = useSafeAreaInsets()
	const [source, setSource] = useState<JKSource>(initialSource)
	const [tags, setTags] = useState<Array<{ id: string, name: string }>>([])
	const [tagId, setTagId] = useState('')
	const [sortId, setSortId] = useState('new')
	const [list, setList] = useState<SongListItem[]>([])
	const [loading, setLoading] = useState(false)
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(true)

	// 请求去重：同一 (source,tagId,sortId,page) 正在请求时直接跳过
	const inFlightRef = useRef<string | null>(null)
	const lastKeyRef = useRef<string>('')

	const loadList = useCallback(async(next: JKSource, nextTag: string, nextSort: string, nextPage: number) => {
		const key = `${next}:${nextTag}:${nextSort}:${nextPage}`
		if (inFlightRef.current === key) return
		inFlightRef.current = key
		setLoading(true)
		try {
			const res: any = await getSongLists(next, { tagId: nextTag, sortId: nextSort, page: nextPage })
			const raw = res?.list ?? []
			// 只在首屏打一次原始对象，用来核对真实字段名（不猜字段）
			const g: any = globalThis
			if (!g.__jkCardLogged && raw.length) {
				g.__jkCardLogged = true
				logInfo('[jk/card]', JSON.stringify(raw[0]).slice(0, 500))
			}
			const items: SongListItem[] = raw.map((item: any) => ({
				id: String(item.id),
				name: item.name ?? '',
				img: item.img ?? item.picUrl,
				desc: item.desc ?? '',
				author: item.author ?? '',
				playCount: item.playCount ?? item.play_count ?? (item as any).playcnt,
				total: item.total ?? (item as any).songcount ?? (item as any).songCount,
			}))

			const total = Number(res?.total ?? 0)
			const accumulated = nextPage === 1 ? items.length : list.length + items.length
			const reachedEnd =
				items.length === 0 ||
				items.length < PAGE_SIZE_GUESS ||
				(total > 0 && accumulated >= total)

			setList(prev => (nextPage === 1 ? items : [...prev, ...items]))
			setPage(nextPage)
			setHasMore(!reachedEnd)
		} catch (err) {
			console.log('[songlist] loadList failed', key, err)
			if (nextPage === 1) setList([])
			setHasMore(false)
		} finally {
			inFlightRef.current = null
			setLoading(false)
		}
	}, [list.length])

	// tags 与第一页合并触发：避免 setTagId 引发的第二次请求
	const loadAll = useCallback(async(next: JKSource) => {
		setLoading(true)
		setList([])
		setHasMore(true)
		setPage(1)
		try {
			// 桌面版歌单页没有标签行；不带 tagId 时接口才返回完整字段（author/total/play_count）
			setTags([])
			setTagId('')
			setLoading(false)
			await loadList(next, '', sortId, 1)
		} catch (err) {
			console.log('[songlist] loadTags failed', next, err)
			setTags([])
			setTagId('')
			setHasMore(false)
			setLoading(false)
		}
	}, [loadList, sortId])

	useEffect(() => {
		void loadAll(source)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [source])

	const onSelectTag = useCallback((nextTagId: string) => {
		if (nextTagId === tagId) return
		setTagId(nextTagId)
		setList([])
		setHasMore(true)
		void loadList(source, nextTagId, sortId, 1)
	}, [tagId, source, sortId, loadList])

	const onSelectSort = useCallback((nextSort: string) => {
		if (nextSort === sortId) return
		setSortId(nextSort)
		setList([])
		setHasMore(true)
		void loadList(source, tagId, nextSort, 1)
	}, [sortId, tagId, source, loadList])

	const onEndReached = useCallback(() => {
		if (loading || !hasMore || list.length === 0) return
		const key = `${source}:${tagId}:${sortId}:${page + 1}`
		if (lastKeyRef.current === key) return
		lastKeyRef.current = key
		void loadList(source, tagId, sortId, page + 1)
	}, [loading, hasMore, list.length, source, tagId, sortId, page, loadList])

	const sourceTabs = React.useMemo(
		() => LIST_SOURCES.map(item => ({ id: item, label: sourceLabel(item, false, 'alias') || sources.find(s => s.id === item)?.name || item })),
		[],
	)

	const sorts = [
		{ id: 'new', label: tr('最新', 'New') },
		{ id: 'hot', label: tr('最热', 'Hot') },
	]

	return (
		<View style={{ flex: 1, backgroundColor: macPalette(!!useAppTheme().isDark).bg, paddingTop: insets.top }}>
			<View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
				<Text style={{ color: macPalette(!!useAppTheme().isDark).textStrong, fontSize: 30, fontWeight: '700' }}>{tr('歌单', 'Playlists')}</Text>
			</View>
			{/* 源标签行：固定高度，不允许被拉伸 */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flexGrow: 0, flexShrink: 0 }}
				contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}
			>
				{sourceTabs.map(tab => {
					const active = tab.id === source
					return (
						<Pressable
							key={tab.id}
							onPress={() => setSource(tab.id)}
							style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: active ? colors.primary : colors.surface }}
						>
							<Text style={{ color: active ? '#fff' : colors.text, fontSize: 13 }}>{tab.label}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			{/* 排序胶囊（桌面版歌单页没有标签行，只保留排序） */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flexGrow: 0, flexShrink: 0 }}
				contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 8 }}
			>
				{sorts.map(item => {
					const active = item.id === sortId
					return (
						<Pressable
							key={item.id}
							onPress={() => onSelectSort(item.id)}
							style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: active ? colors.primary : colors.surfaceMuted }}
						>
							<Text style={{ color: active ? '#fff' : colors.textMuted, fontSize: 12 }}>{item.label}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			<FlatList
				data={list}
				keyExtractor={item => item.id}
				style={{ flex: 1 }}
				contentContainerStyle={{ paddingBottom: 176 }}
				onEndReachedThreshold={0.4}
				onEndReached={onEndReached}
				removeClippedSubviews
				initialNumToRender={12}
				maxToRenderPerBatch={12}
				windowSize={7}
				renderItem={({ item }) => (
					<SongListCard
						title={item.name}
						cover={item.img}
						author={item.author}
						trackCount={item.total}
						playCount={item.playCount}
						onPress={() => router.push(`/(tabs)/songlist/${item.id}?source=${source}` as any)}
					/>
				)}
				ListFooterComponent={loading ? (
					<View style={{ paddingVertical: 16 }}>
						<StateView mode="loading" />
					</View>
				) : null}
				ListEmptyComponent={!loading ? (
					<StateView mode="empty" title={i18n.t('find.noMoreResults')} />
				) : null}
			/>
		</View>
	)
}

export default SongListScreen
