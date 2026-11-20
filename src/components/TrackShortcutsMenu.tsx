import { setPendingMusic } from '@/jk/pendingMusic'
import { setPendingChangeSource } from '@/jk/pendingChangeSource'
import { logInfo } from '@/helpers/logger'
import { trackToJk } from '@/jk/adapt'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { getSingerMidBySingerName } from '@/helpers/userApi/getMusicSource'
import { isInPlayList } from '@/store/playList'
import { isInLoveList, libraryVersionStore, toggleLove } from '@/jk/libraryStore'
import { useQueue } from '@/store/queue'
import i18n, { tr } from '@/utils/i18n'
import { MenuAction, MenuView } from '@react-native-menu/menu'
import { useFocusEffect, useRouter } from 'expo-router'
import { Clipboard } from 'react-native'
import { showToast } from '@/utils/utils'
import { PropsWithChildren, useCallback, useMemo, useState } from 'react'
import type { Track } from '@/player/types'
import { match, P } from 'ts-pattern'

type TrackShortcutsMenuProps = PropsWithChildren<{
	track: Track
	isSinger?: boolean
	allowDelete?: boolean
	onDeleteTrack?: (trackId: string) => void
}>

export const TrackShortcutsMenu = ({
	track,
	children,
	isSinger,
	allowDelete,
	onDeleteTrack,
}: TrackShortcutsMenuProps) => {
	const router = useRouter()
	// 收藏状态来自 JKMUSIC 列表模型（旧 favorites store 已移除）
	libraryVersionStore.useValue()
	const jkTrackForLove = trackToJk(track as any)
	const isFavorite = isInLoveList(jkTrackForLove)
	const { activeQueueId } = useQueue()

	const [isInPlaylist, setIsInPlaylist] = useState(false)

	const updateIsInPlaylist = useCallback(() => {
		setIsInPlaylist(isInPlayList(track as IMusic.IMusicItem))
	}, [track])

	useFocusEffect(
		useCallback(() => {
			updateIsInPlaylist()
		}, [updateIsInPlaylist]),
	)

	const handleViewArtist = (artist: string) => {
		getSingerMidBySingerName(artist).then((singerMid) => {
			router.push(`/(modals)/${singerMid}`)
		})
	}
	const handleAddToStoredPlayList = (track: IMusic.IMusicItem) => {
		// 用模块级变量传完整对象：URL 参数会丢掉 meta.songmid，导致加进歌单后无法取流
		setPendingMusic(trackToJk(track as any) as any)
		router.push('/(modals)/addToPlaylist' as any)
	}
	const artists = useMemo(() => {
		if (typeof track.artist === 'string') {
			if (track.artist.includes('、')) {
				return track.artist.split('、').map((artist) => artist.trim())
			} else {
				return [track.artist]
			}
		} else if (Array.isArray(track.artist)) {
			return track.artist
		} else {
			return []
		}
	}, [track.artist])

	const artistActions = useMemo(() => {
		if (artists.length === 1) {
			return [
				{
					id: 'view-single-artist',
					title: i18n.t('menu.showArtist'),
					image: 'person',
				},
			]
		} else {
			return [
				{
					id: 'view-artists',
					title: i18n.t('menu.showArtist'),
					image: 'person',
					subactions: artists.map((artist) => ({
						id: `view-artist-${artist}`,
						title: artist,
						image: 'person',
					})),
				},
			]
		}
	}, [artists])

	const handlePressAction = async (id: string) => {
		await match(id)
			.with('add-to-favorites', async () => {
				toggleLove(jkTrackForLove)
				if (activeQueueId?.startsWith('favorites')) {
					//await TrackPlayer.add(track)
				}
			})
			.with('remove-from-favorites', async () => {
				toggleLove(jkTrackForLove)
				if (activeQueueId?.startsWith('favorites')) {
					// const queue = await TrackPlayer.getQueue()
					// const trackToRemove = queue.findIndex((queueTrack) => queueTrack.url === track.url)
					// await TrackPlayer.remove(trackToRemove)
				}
			})
			.with('add-to-playlist', async () => {
				await myTrackPlayer.add(track as IMusic.IMusicItem)
				updateIsInPlaylist()
			})
			.with('remove-from-playlist', async () => {
				await myTrackPlayer.remove(track as IMusic.IMusicItem)
				updateIsInPlaylist()
			})
			.with('view-single-artist', async () => {
				handleViewArtist(artists[0])
			})
			.with(
				P.when((id) => id.startsWith('view-artist-')),
				(id) => {
					const artist = id.replace('view-artist-', '')
					handleViewArtist(artist)
				},
			)
			.with('download-track', async () => {
				void import('@/jk/downloader').then(m => m.downloadTrack(track)).catch(() => undefined)
			})
			.with(
				P.when((id) => id.startsWith('download-') && id !== 'download-track'),
				async (id) => {
					const quality = id.replace('download-', '')
					if (!['128k', '320k', 'flac'].includes(quality)) return
					logInfo('[menu] download quality=', quality, 'track=', String((track as any)?.title ?? ''))
					void import('@/jk/downloader')
						.then(m => m.downloadTrack(track, { quality }))
						.catch(() => undefined)
				},
			)
			.with('change-source', async () => {
				// 与 mac 一致：打开换源弹窗（按平台搜索同曲并替换）
				setPendingChangeSource(trackToJk(track as any) as any)
				router.push('/(modals)/changeSource' as any)
			})
			.with('copy-song-name', async () => {
				// 与 mac 一致：按「下载文件名格式」（download.fileName，默认「歌名 - 歌手」）格式化
				const { getSetting } = await import('@/jk/settingsStore')
				const template = String(getSetting('download.fileName', '歌名 - 歌手') ?? '歌名 - 歌手')
				const name = String((track as any)?.title ?? '')
				const singer = String((track as any)?.artist ?? '')
				const text = template.replace('歌手', singer).replace('歌名', name)
				try {
					Clipboard.setString(text)
					showToast(tr('已复制', 'Copied'), text, 'success')
				} catch (err) {
					logInfo('[menu] copy failed', String((err as any)?.message ?? err))
				}
			})
			.with('search-in-source', async () => {
				// 与 mac 一致：跳搜索页并带上「歌名 歌手」；额外带上曲目所属平台
				const q = `${String((track as any)?.title ?? '')} ${String((track as any)?.artist ?? '')}`.trim()
				const src = String((track as any)?.platform ?? '')
				const params = [`q=${encodeURIComponent(q)}`]
				if (['kw', 'kg', 'tx', 'wy', 'mg'].includes(src)) params.push(`source=${src}`)
				router.push(`/(tabs)/search?${params.join('&')}` as any)
			})
			.with('add-to-storedPlayList', async () => {
				handleAddToStoredPlayList(track as IMusic.IMusicItem)
			})
			.with('delete-track', async () => {
				onDeleteTrack?.(track.id)
			})
			.otherwise(() => {
				// handleViewArtist()
				console.warn(`Unknown menu action ${id}`)
			})
	}

	return (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => handlePressAction(event)}
			actions={[
				{
					id: isInPlaylist ? 'remove-from-playlist' : 'add-to-playlist',
					title: isInPlaylist
						? i18n.t('menu.removeFromPlayingList')
						: i18n.t('menu.addToPlayingList'),
					image: isInPlaylist ? 'minus' : 'plus',
				},
				{
					id: isFavorite ? 'remove-from-favorites' : 'add-to-favorites',
					title: isFavorite ? i18n.t('menu.removeFromFavorites') : i18n.t('menu.addToFavorites'),
					image: isFavorite ? 'heart.fill' : 'heart',
				},
				{
					id: 'download-track',
					title: tr('下载', 'Download'),
					image: 'arrow.down.circle',
					// 二级菜单：手动下载可选音质（不选则用设置里的默认值）
					subactions: [
						{ id: 'download-128k', title: '128k' },
						{ id: 'download-320k', title: '320k' },
						{ id: 'download-flac', title: 'flac' },
					],
				} as any,
				{
					id: 'add-to-storedPlayList',
					title: i18n.t('menu.addToPlaylist'),
					image: 'text.badge.plus',
				},
				{
					id: 'change-source',
					title: tr('歌曲换源', 'Change Source'),
					image: 'arrow.triangle.swap',
				},
				{
					id: 'copy-song-name',
					title: tr('复制歌曲名', 'Copy Song Name'),
					image: 'doc.on.doc',
				},
				{
					id: 'search-in-source',
					title: tr('搜索', 'Search'),
					image: 'magnifyingglass',
				},
				...(isSinger ? [] : (artistActions as MenuAction[])),
				...(allowDelete
					? [
							{
								id: 'delete-track',
								title: i18n.t('menu.delete'),
								image: 'trash',
								attributes: {
									destructive: true,
								},
							},
						]
					: []),
			]}
		>
			{children}
		</MenuView>
	)
}
