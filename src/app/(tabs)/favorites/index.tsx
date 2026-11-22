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
import { useAppTheme } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'

import i18n, { tr } from '@/utils/i18n'
import { logInfo } from '@/helpers/logger'
import { showToast } from '@/utils/utils'
import { router } from 'expo-router'
import React, { useMemo, useState, useCallback } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

const FavoritesScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
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
				name: tr('试听列表', 'Listening'),
				title: tr('试听列表', 'Listening'),
				description: `${tr('共', '')} ${defaultList.length} ${tr('首', 'songs')}`.trim(),
				coverImg: 'https://y.qq.com/mediastyle/global/img/cover_like.png?max_age=2592000',
				tracks: defaultList.map(jkToTrack),
			},
			{
				id: LIST_IDS.LOVE,
				name: tr('我的收藏', 'Favorites'),
				title: tr('我的收藏', 'Favorites'),
				description: `${tr('共', '')} ${loveList.length} ${tr('首', 'songs')}`.trim(),
				coverImg: 'https://y.qq.com/mediastyle/global/img/cover_like.png?max_age=2592000',
				tracks: loveList.map(jkToTrack),
			},
			...userLists.map(item => ({
				id: item.id,
				name: item.name,
				title: item.name,
				description: `${tr('共', '')} ${item.list.length} ${tr('首', 'songs')}`.trim(),
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
		<View style={{ flex: 1, backgroundColor: c.bg }}>
			<ScrollView contentInsetAdjustmentBehavior="automatic" style={{ paddingHorizontal: screenPadding.horizontal }}>
				<PlaylistsList
					playlists={filteredPlayLists}
					onPlaylistPress={(playlist: Playlist) => {
						router.push(`/(tabs)/favorites/${playlist.id}` as any)
					}}
					onPlaylistUpdate={async (id, name) => {
						try {
							showToast(tr('提示', 'Notice'), tr(`正在更新「${name}」…`, `Updating "${name}"…`), 'info')
							const { updateUserListFromSource } = await import('@/jk/libraryStore')
							const r = await updateUserListFromSource(id)
							setVersion(v => v + 1)
							if (r.ok) {
								showToast(tr('已更新', 'Updated'), tr(`「${name}」共 ${r.count} 首`, `${r.count} songs`), 'success')
							} else {
								showToast(tr('更新失败', 'Update failed'), String(r.reason ?? ''), 'error')
							}
						} catch (err) {
							showToast(tr('更新失败', 'Update failed'), String((err as any)?.message ?? err), 'error')
						}
					}}
					onPlaylistDelete={(id, name) => {
						removeUserList(id)
						setVersion(v => v + 1)
						logInfo('[library] removeList id=', id, 'remain=', getUserLists().length, 'name=', name)
						showToast(tr('已删除', 'Deleted'), tr(`歌单「${name}」已删除`, `Playlist "${name}" deleted`), 'success')
					}}
				/>
			</ScrollView>
		</View>
	)
}

export default FavoritesScreen
