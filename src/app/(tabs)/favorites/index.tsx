/**
 * 我的列表：试听列表 / 我的收藏 / 用户自建列表。
 * 数据源为 JKMUSIC 的列表模型（MMKV 持久化）。
 */
import { PlaylistsList } from '@/components/PlaylistsList'
import { screenPadding } from '@/constants/tokens'
import { Playlist } from '@/helpers/types'
import { jkToTrack } from '@/jk/adapt'
import { LIST_IDS, getDefaultList, getLoveList, getUserLists, removeUserList } from '@/jk/libraryStore'
import { useNavigationSearch } from '@/hooks/useNavigationSearch'
import { useDefaultStyles } from '@/styles'
import i18n from '@/utils/i18n'
import { logInfo } from '@/helpers/logger'
import { showToast } from '@/utils/utils'
import { router } from 'expo-router'
import React, { useMemo, useState, useCallback } from 'react'
import { ScrollView, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

const FavoritesScreen = () => {
	const defaultStyles = useDefaultStyles()
	const [version, setVersion] = useState(0)
	const search = useNavigationSearch({
		searchBarOptions: {
			placeholder: i18n.t('find.inFavorites'),
			cancelButtonText: i18n.t('find.cancel'),
		},
	})

	// 每次进入页面刷新一次（列表可能在别处被修改）
	useFocusEffect(useCallback(() => { setVersion(v => v + 1) }, []))

	const playLists = useMemo<Playlist[]>(() => {
		void version
		const defaultList = getDefaultList()
		const loveList = getLoveList()
		const userLists = getUserLists()
		return [
			{
				id: LIST_IDS.DEFAULT,
				name: '试听列表',
				title: '试听列表',
				description: `共 ${defaultList.length} 首`,
				coverImg: 'https://y.qq.com/mediastyle/global/img/cover_like.png?max_age=2592000',
				tracks: defaultList.map(jkToTrack),
			},
			{
				id: LIST_IDS.LOVE,
				name: '我的收藏',
				title: '我的收藏',
				description: `共 ${loveList.length} 首`,
				coverImg: 'https://y.qq.com/mediastyle/global/img/cover_like.png?max_age=2592000',
				tracks: loveList.map(jkToTrack),
			},
			...userLists.map(item => ({
				id: item.id,
				name: item.name,
				title: item.name,
				description: `共 ${item.list.length} 首`,
				coverImg: 'https://y.qq.com/mediastyle/global/img/cover_like.png?max_age=2592000',
				tracks: item.list.map(jkToTrack),
			})),
		] as Playlist[]
	}, [version])

	const filteredPlayLists = useMemo(() => {
		if (!search) return playLists
		return playLists.filter(playlist => playlist.name.toLowerCase().includes(search.toLowerCase()))
	}, [playLists, search])

	return (
		<View style={defaultStyles.container}>
			<ScrollView contentInsetAdjustmentBehavior="automatic" style={{ paddingHorizontal: screenPadding.horizontal }}>
				<PlaylistsList
					playlists={filteredPlayLists}
					onPlaylistPress={(playlist: Playlist) => {
						router.push(`/(tabs)/favorites/${playlist.id}` as any)
					}}
					onPlaylistDelete={(id, name) => {
						removeUserList(id)
						setVersion(v => v + 1)
						logInfo('[library] removeList id=', id, 'remain=', getUserLists().length, 'name=', name)
						showToast('已删除', `歌单「${name}」已删除`, 'success')
					}}
				/>
			</ScrollView>
		</View>
	)
}

export default FavoritesScreen
