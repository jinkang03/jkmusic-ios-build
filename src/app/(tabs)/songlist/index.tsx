/**
 * 歌单页：标签 + 排序 + 分页列表，数据来自 JKMUSIC musicSdk。
 */
import { useAppTheme } from '@/hooks/useAppTheme'
import { getSongLists, getSongListTags, sources } from '@/jk/musicSdk'
import type { JKSource } from '@/jk/musicSdk'
import { unknownTrackImageUri } from '@/constants/images'
import i18n from '@/utils/i18n'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native'

const LIST_SOURCES: JKSource[] = ['kw', 'kg', 'tx', 'wy', 'mg']

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
	const [source, setSource] = useState<JKSource>('kw')
	const [tags, setTags] = useState<Array<{ id: string, name: string }>>([])
	const [tagId, setTagId] = useState('')
	const [sortId, setSortId] = useState('new')
	const [list, setList] = useState<SongListItem[]>([])
	const [loading, setLoading] = useState(false)
	const [page, setPage] = useState(1)

	const loadTags = useCallback(async(next: JKSource) => {
		try {
			const res: any = await getSongListTags(next)
			const first = res?.tags?.[0]?.list ?? res?.hotTag ?? []
			setTags(first.slice(0, 20).map((t: any) => ({ id: String(t.id), name: t.name })))
			setTagId(first?.[0]?.id ? String(first[0].id) : '')
		} catch (err) {
			console.log('load tags failed', err)
			setTags([])
			setTagId('')
		}
	}, [])

	const loadList = useCallback(async(next: JKSource, nextTag: string, nextSort: string, nextPage: number) => {
		setLoading(true)
		try {
			const res: any = await getSongLists(next, { tagId: nextTag, sortId: nextSort, page: nextPage })
			const items = (res?.list ?? []).map((item: any) => ({
				id: String(item.id),
				name: item.name ?? '',
				img: item.img ?? item.picUrl,
				desc: item.desc ?? '',
				author: item.author ?? '',
				playCount: item.playCount ?? item.play_count,
				total: item.total,
			}))
			setList(prev => (nextPage === 1 ? items : [...prev, ...items]))
			setPage(nextPage)
		} catch (err) {
			console.log('load songlists failed', err)
			if (nextPage === 1) setList([])
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void loadTags(source)
	}, [source, loadTags])

	useEffect(() => {
		void loadList(source, tagId, sortId, 1)
	}, [source, tagId, sortId, loadList])

	const sourceTabs = useMemo(
		() => LIST_SOURCES.map(item => ({ id: item, label: sources.find(s => s.id === item)?.name ?? item })),
		[],
	)

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}>
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

			{tags.length > 0 && (
				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 8 }}>
					{tags.map(tag => {
						const active = tag.id === tagId
						return (
							<Pressable
								key={tag.id}
								onPress={() => setTagId(tag.id)}
								style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: active ? colors.surfaceElevated : colors.surfaceMuted }}
							>
								<Text style={{ color: active ? colors.primary : colors.textMuted, fontSize: 12 }}>{tag.name}</Text>
							</Pressable>
						)
					})}
				</ScrollView>
			)}

			<FlatList
				data={list}
				numColumns={2}
				keyExtractor={item => item.id}
				columnWrapperStyle={{ gap: 10 }}
				contentContainerStyle={{ padding: 12, gap: 10 }}
				onEndReachedThreshold={0.4}
				onEndReached={() => {
					if (!loading) void loadList(source, tagId, sortId, page + 1)
				}}
				renderItem={({ item }) => (
					<Pressable
						style={{ flex: 1 }}
						onPress={() => router.push(`/(tabs)/songlist/${item.id}?source=${source}` as any)}
					>
						<Image
							source={{ uri: item.img || unknownTrackImageUri }}
							style={{ width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.surface }}
							contentFit="cover"
						/>
						<Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, marginTop: 6 }}>{item.name}</Text>
					</Pressable>
				)}
				ListFooterComponent={loading ? (
					<View style={{ paddingVertical: 16, alignItems: 'center' }}>
						<ActivityIndicator color={colors.loading} />
					</View>
				) : null}
				ListEmptyComponent={!loading ? (
					<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
						{i18n.t('find.noMoreResults')}
					</Text>
				) : null}
			/>
		</View>
	)
}

export default SongListScreen
