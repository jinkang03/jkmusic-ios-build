import { PlaylistListItem } from '@/components/PlaylistListItem'
import { unknownTrackImageUri } from '@/constants/images'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { Playlist } from '@/helpers/types'
import { useNavigationSearch } from '@/hooks/useNavigationSearch'
import { useUtilsStyles } from '@/styles'
import i18n, { tr } from '@/utils/i18n'
import { useEffect, useMemo, useRef } from 'react'
import { Alert, FlatList, FlatListProps, Text, View } from 'react-native'
import { Image } from 'expo-image'
type PlaylistsListProps = {
	playlists: Playlist[]
	onPlaylistPress: (playlist: Playlist) => void
	/** 传入时由调用方负责删除（libraryStore）；不传则回退旧的 Cymusic store */
	onPlaylistDelete?: (id: string, name: string) => void
	/** 从来源平台重新拉取歌单（对应 mac 端的「更新歌单」） */
	onPlaylistUpdate?: (id: string, name: string) => void
	/** 选择自定义封面（相册） */
	onPlaylistSetCover?: (id: string, name: string) => void
	/** 恢复默认封面（删掉自定义封面） */
	onPlaylistResetCover?: (id: string, name: string) => void
	/** 打开「排序歌单」页（控制歌单排列顺序，含内置歌单） */
	onPlaylistSort?: () => void
	/** 一键置顶某个歌单 */
	onPlaylistPinTop?: (id: string, name: string) => void
	/** dev 深链：进入页面后自动展开某个歌单的菜单（免长按验收） */
	autoMenuName?: string
} & Partial<FlatListProps<Playlist>>

export const PlaylistsList = ({
	playlists,
	onPlaylistPress: handlePlaylistPress,
	onPlaylistDelete,
	onPlaylistUpdate,
	onPlaylistSetCover,
	onPlaylistResetCover,
	onPlaylistSort,
	onPlaylistPinTop,
	autoMenuName,
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
		// 内置列表（试听列表 / 我的收藏）不能删除、不能改封面，但可以排序/置顶
		const isBuiltin = playlist.id === 'default' || playlist.id === 'love'
		const buttons: Parameters<typeof Alert.alert>[2] = []
		if (!isBuiltin) {
			buttons.push({
				// 已设过自定义封面时文案变「更换封面」
				text: playlist.hasCustomCover
					? tr('更换封面', 'Change Cover')
					: tr('设置封面', 'Set Cover'),
				onPress: () => onPlaylistSetCover?.(playlist.id, playlist.name),
			})
			if (playlist.hasCustomCover) {
				buttons.push({
					text: tr('恢复默认封面', 'Reset Cover'),
					onPress: () => onPlaylistResetCover?.(playlist.id, playlist.name),
				})
			}
			// 手动创建的歌单没有来源链接，不显示「更新歌单」（不做灰色假按钮）
			if (playlist.canUpdate) {
				buttons.push({
					text: tr('更新歌单', 'Update Playlist'),
					onPress: () => onPlaylistUpdate?.(playlist.id, playlist.name),
				})
			}
		}
		buttons.push({
			text: tr('排序歌单', 'Sort Playlists'),
			onPress: () => onPlaylistSort?.(),
		})
		buttons.push({
			text: tr('一键置顶', 'Pin to Top'),
			onPress: () => onPlaylistPinTop?.(playlist.id, playlist.name),
		})
		if (!isBuiltin) {
			buttons.push({
				text: tr('删除歌单', 'Delete Playlist'),
				style: 'destructive',
				onPress: () => showDeleteAlert(playlist),
			})
		}
		buttons.push({ text: tr('取消', 'Cancel'), style: 'cancel' })
		Alert.alert(playlist.name, undefined, buttons)
	}

	// dev 深链 ?menu=<歌单名>：页面就绪后自动弹菜单（模拟长按），只触发一次
	const autoMenuDoneRef = useRef(false)
	useEffect(() => {
		if (!autoMenuName || autoMenuDoneRef.current) return
		const hit = playlists.find(p => p.name === autoMenuName)
			?? playlists.find(p => p.name.includes(autoMenuName))
		if (!hit) return
		autoMenuDoneRef.current = true
		const t = setTimeout(() => showActions(hit), 600)
		return () => clearTimeout(t)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoMenuName, playlists.length])

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
