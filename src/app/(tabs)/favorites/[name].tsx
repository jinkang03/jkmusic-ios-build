/**
 * 列表详情：展示某个 JKMUSIC 列表内的歌曲。
 */
import SongListView from '@/components/mac/SongListView'
import { useAppTheme } from '@/hooks/useAppTheme'
import { jkToTrack } from '@/jk/adapt'
import { getListById } from '@/jk/libraryStore'
import { useLocalSearchParams } from 'expo-router'
import React, { useMemo } from 'react'
import { Text, View } from 'react-native'

const ListDetailScreen = () => {
	const { colors } = useAppTheme()
	const params = useLocalSearchParams<{ name: string }>()
	const listId = params.name

	const tracks = useMemo(() => {
		const list = getListById(listId)
		return list.map(jkToTrack)
		// 依赖 listId 即可，列表变更通过重新进入页面刷新
	}, [listId])

	if (!tracks.length) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
				<Text style={{ color: colors.textMuted }}>列表还是空的</Text>
			</View>
		)
	}

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<SongListView tracks={tracks} queueId={`mylist_${listId}`} emptyText="列表还是空的" />
		</View>
	)
}

export default ListDetailScreen
