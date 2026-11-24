/**
 * 我的列表：试听列表 / 我的收藏 / 用户自建列表。
 * 数据源为 JKMUSIC 的列表模型（MMKV 持久化）。
 */
import { PlaylistsList } from '@/components/PlaylistsList'
import { screenPadding } from '@/constants/tokens'
import { Playlist } from '@/helpers/types'
import { jkToTrack } from '@/jk/adapt'
import {
	LIST_IDS,
	applyListOrder,
	clearUserListCover,
	getDefaultList,
	getLoveList,
	getUserLists,
	libraryVersionStore,
	moveListToTop,
	removeUserList,
	setUserListCover,
} from '@/jk/libraryStore'
import { deleteCover, resolveListCover, saveCoverFrom } from '@/jk/covers'
import { useNavigationSearch } from '@/hooks/useNavigationSearch'
import { useAppTheme } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'

import i18n, { tr } from '@/utils/i18n'
import { logInfo } from '@/helpers/logger'
import { showToast } from '@/utils/utils'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useMemo, useState, useCallback } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

const FavoritesScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const [version, setVersion] = useState(0)
	// dev 深链：jkmusic://favorites?menu=<歌单名> 自动展开菜单
	const routeParams = useLocalSearchParams<{ menu?: string }>()
	const search = useNavigationSearch({
		searchBarOptions: {
			placeholder: i18n.t('find.inFavorites'),
			cancelButtonText: i18n.t('find.cancel'),
		},
	})

	// 每次进入页面刷新一次（列表可能在别处被修改）
	useFocusEffect(useCallback(() => { setVersion(v => v + 1) }, []))

	// 顺序变化也要重渲染（排序页/一键置顶都走 libraryVersionStore）
	const libraryVersion = libraryVersionStore.useValue()
	const playLists = useMemo<Playlist[]>(() => {
		void version
		void libraryVersion
		const defaultList = getDefaultList()
		const loveList = getLoveList()
		const userLists = getUserLists()
		return applyListOrder([
			{
				id: LIST_IDS.DEFAULT,
				name: tr('试听列表', 'Listening'),
				title: tr('试听列表', 'Listening'),
				description: `${tr('共', '')} ${defaultList.length} ${tr('首', 'songs')}`.trim(),
				// 内置列表固定心形（沿用原来的心形图，保证外观不变）
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
				// 自定义封面 → 平台封面 → 第一首歌封面；都拿不到时为空（列表行回退心形）
				coverImg: resolveListCover(item),
				// 有来源链接才显示「更新歌单」；设过自定义封面才显示「恢复默认封面」
				canUpdate: !!(item.source && item.sourceListId),
				hasCustomCover: !!item.coverFile,
				tracks: item.list.map(jkToTrack),
			})),
		]) as Playlist[]
	}, [version, libraryVersion])

	const filteredPlayLists = useMemo(() => {
		if (!search) return playLists
		return playLists.filter(playlist => playlist.name.toLowerCase().includes(search.toLowerCase()))
	}, [playLists, search])

	return (
		<View style={{ flex: 1, backgroundColor: c.bg }}>
			<ScrollView contentInsetAdjustmentBehavior="automatic" style={{ paddingHorizontal: screenPadding.horizontal }}>
				<PlaylistsList
					playlists={filteredPlayLists}
					autoMenuName={routeParams?.menu ? String(routeParams.menu) : undefined}
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
					onPlaylistSetCover={async (id, name) => {
						try {
							const ImagePicker = await import('expo-image-picker')
							const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
							if (!perm.granted) {
								showToast(tr('提示', 'Notice'), tr('需要相册权限才能设置封面', 'Photo library permission is required'), 'error')
								return
							}
							const res = await ImagePicker.launchImageLibraryAsync({
								mediaTypes: ['images'] as any,
								allowsEditing: true,
								aspect: [1, 1],
								quality: 0.9,
							})
							if (res.canceled || !res.assets?.[0]?.uri) return
							const prevFile = getUserLists().find(l => l.id === id)?.coverFile
							const file = await saveCoverFrom(res.assets[0].uri, id)
							setUserListCover(id, { coverFile: file })
							if (prevFile && prevFile !== file) void deleteCover(prevFile)
							setVersion(v => v + 1)
							logInfo('[library] setCover id=', id, 'file=', file)
							showToast(tr('已设置', 'Done'), tr(`「${name}」封面已更新`, `Cover of "${name}" updated`), 'success')
						} catch (err) {
							showToast(tr('设置失败', 'Failed'), String((err as any)?.message ?? err).slice(0, 60), 'error')
						}
					}}
					onPlaylistResetCover={(id, name) => {
						const prevFile = getUserLists().find(l => l.id === id)?.coverFile
						clearUserListCover(id)
						if (prevFile) void deleteCover(prevFile)
						setVersion(v => v + 1)
						logInfo('[library] resetCover id=', id)
						showToast(tr('已恢复', 'Reset'), tr(`「${name}」已恢复默认封面`, `Cover of "${name}" reset`), 'success')
					}}
					onPlaylistSort={() => {
						router.push('/(modals)/sortPlaylists' as any)
					}}
					onPlaylistPinTop={(id, name) => {
						moveListToTop(id)
						setVersion(v => v + 1)
						logInfo('[library] pinTop id=', id, 'name=', name)
						showToast(tr('已置顶', 'Pinned'), tr(`「${name}」已移到最前`, `"${name}" moved to top`), 'success')
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
