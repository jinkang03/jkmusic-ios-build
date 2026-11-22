import { PlaylistListItem } from '@/components/PlaylistListItem'
import { unknownTrackImageUri } from '@/constants/images'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { Playlist } from '@/helpers/types'
import { useNavigationSearch } from '@/hooks/useNavigationSearch'
import { useUtilsStyles } from '@/styles'
import i18n, { tr } from '@/utils/i18n'
import { useMemo } from 'react'
import { Alert, FlatList, FlatListProps, Text, View } from 'react-native'
import { Image } from 'expo-image'
type PlaylistsListProps = {
	playlists: Playlist[]
	onPlaylistPress: (playlist: Playlist) => void
	/** 传入时由调用方负责删除（libraryStore）；不传则回退旧的 Cymusic store */
	onPlaylistDelete?: (id: string, name: string) => void
	/** 从来源平台重新拉取歌单（对应 mac 端的「更新歌单」） */
	onPlaylistUpdate?: (id: string, name: string) => void
} & Partial<FlatListProps<Playlist>>

export const PlaylistsList = ({
	playlists,
	onPlaylistPress: handlePlaylistPress,
	onPlaylistDelete,
	onPlaylistUpdate,
	...flatListProps
}: PlaylistsListProps) => {
	const utilsStyles = useUtilsStyles()
	const search = useNavigationSearch({
		searchBarOptions: {
			placeholder: i18n.t('find.inPlaylist'),
			cancelButtonText: i18n.t('find.cancel'),
		},
	})

	const filteredPlaylist = useMemo(() => {
		if (!search) {
			return playlists
		}

		return playlists.filter((playlist) =>
			playlist.name.toLowerCase().includes(search.toLowerCase()),
		)
	}, [playlists, search])
	const itemDivider = useMemo(
		() => () => <View style={{ ...utilsStyles.itemSeparator, marginLeft: 80, marginVertical: 12 }} />,
		[utilsStyles],
	)
	const emptyListComponent = useMemo(
		() => (
			<View>
				<Text style={utilsStyles.emptyContentText}>No playlist found</Text>

				<Image
					contentFit="cover"
					cachePolicy="memory-disk"
					priority="normal"
					source={{ uri: unknownTrackImageUri }}
					style={utilsStyles.emptyContentImage}
				/>
			</View>
		),
		[utilsStyles],
	)

	const showActions = (playlist: Playlist) => {
		// 内置列表（试听列表 / 我的收藏）不允许删除/更新
		if (playlist.id === 'default' || playlist.id === 'love') {
			Alert.alert(tr('提示', 'Notice'), tr('内置列表不能删除', 'Built-in lists cannot be deleted'))
			return
		}
		Alert.alert(playlist.name, undefined, [
			{
				text: tr('更新歌单', 'Update Playlist'),
				onPress: () => onPlaylistUpdate?.(playlist.id, playlist.name),
			},
			{
				text: tr('删除歌单', 'Delete Playlist'),
				style: 'destructive',
				onPress: () => showDeleteAlert(playlist),
			},
			{ text: tr('取消', 'Cancel'), style: 'cancel' },
		])
	}

	const showDeleteAlert = (playlist: Playlist) => {
		// 内置列表（试听列表 / 我的收藏）不允许删除
		if (playlist.id === 'default' || playlist.id === 'love') {
			Alert.alert(tr('提示', 'Notice'), tr('内置列表不能删除', 'Built-in lists cannot be deleted'))
			return
		}
		Alert.alert(tr('删除歌单', 'Delete Playlist'), tr(`确定要删除「${playlist.name}」吗？`, `Delete "${playlist.name}"?`), [
			{ text: tr('取消', 'Cancel'), style: 'cancel' },
			{
				text: tr('删除', 'Delete'),
				style: 'destructive',
				onPress: () => {
					if (onPlaylistDelete) {
						onPlaylistDelete(playlist.id, playlist.name)
						return
					}
					// 兼容旧调用方：没有传 handler 时走原 Cymusic store
					void (async () => {
						try {
							const result = await myTrackPlayer.deletePlayLists(playlist.id)
							Alert.alert(result === 'success' ? tr('成功', 'Success') : tr('错误', 'Error'), result === 'success' ? tr('歌单删除成功', 'Playlist deleted') : String(result))
						} catch {
							Alert.alert(tr('错误', 'Error'), tr('删除歌单失败', 'Failed to delete playlist'))
						}
					})()
				},
			},
		])
	}
	return (
		<FlatList
			contentContainerStyle={{ paddingTop: 10, paddingBottom: 176 }}
			ItemSeparatorComponent={itemDivider}
			ListFooterComponent={itemDivider}
			ListEmptyComponent={emptyListComponent}
			data={filteredPlaylist}
			renderItem={({ item: playlist }) => (
				<PlaylistListItem
					playlist={playlist}
					onPress={() => handlePlaylistPress(playlist)}
					onLongPress={() => showActions(playlist)}
				/>
			)}
			{...flatListProps}
		/>
	)
}
