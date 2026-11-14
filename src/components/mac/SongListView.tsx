/**
 * 统一的歌曲列表视图：把「五列 SongRow」和「播放/队列」接在一起。
 *
 * 播放逻辑全部复用 myTrackPlayer 的现成 API（与 TracksList 一致），
 * 这里只负责渲染与把点击事件转成 playWithReplacePlayList，不自己维护队列。
 */
import React, { useEffect, useRef } from 'react'
import { FlatList } from 'react-native'
import { useRouter } from 'expo-router'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import SongRow, { SongRowHeader } from './SongRow'
import StateView from './StateView'
import type { Track } from '@/player/types'

const formatDuration = (v?: number | string | null): string => {
	if (typeof v === 'string' && v.includes(':')) return v
	const s = Math.max(0, Math.round(Number(v ?? 0)))
	if (!s) return '--:--'
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export interface SongListViewProps {
	tracks: any[]
	queueId: string
	/** 加载完成后自动播放第 N 首（深链 ?play=1&index=N 用） */
	autoPlayIndex?: number
	emptyText?: string
}

const SongListView = ({ tracks, queueId, autoPlayIndex, emptyText }: SongListViewProps) => {
	const router = useRouter()
	const currentMusic: any = myTrackPlayer.useCurrentMusic()
	const autoPlayedRef = useRef(false)

	// 深链自动播放：只触发一次
	useEffect(() => {
		if (autoPlayIndex == null || autoPlayIndex < 0) return
		if (autoPlayedRef.current) return
		if (!tracks.length) return
		const idx = Math.max(0, Math.min(tracks.length - 1, autoPlayIndex))
		const target: any = tracks[idx]
		if (!target) return
		autoPlayedRef.current = true
		void myTrackPlayer.playWithReplacePlayList(target, tracks as any)
	}, [autoPlayIndex, tracks])

	const isCurrent = (track: any) => {
		if (!currentMusic) return false
		return String(currentMusic.id) === String(track.id) && String(currentMusic.platform) === String(track.platform)
	}

	if (!tracks.length) {
		return <StateView mode="empty" title={emptyText ?? '暂无歌曲'} />
	}

	return (
		<FlatList
			ListHeaderComponent={<SongRowHeader />}
			stickyHeaderIndices={undefined}
			data={tracks}
			keyExtractor={(item: any, index) => `${item?.id ?? index}-${item?.platform ?? ''}`}
			renderItem={({ item, index }) => {
				const active = isCurrent(item)
				return (
					<SongRow
						index={index + 1}
						title={item?.title ?? item?.name ?? ''}
						artist={item?.artist ?? item?.singer ?? ''}
						album={item?.album ?? item?.meta?.albumName ?? ''}
						duration={formatDuration(item?.duration ?? item?.interval)}
						badge={item?.platform ? String(item.platform).toUpperCase() : undefined}
						active={active}
						onPress={() => {
							if (active) {
								router.push('/player' as any)
								return
							}
							// 队列完全交给 playWithReplacePlayList 建立（与 TracksList 一致）
							void myTrackPlayer.playWithReplacePlayList(item, tracks as any)
						}}
					/>
				)
			}}
			removeClippedSubviews
			initialNumToRender={14}
			windowSize={7}
			maxToRenderPerBatch={14}
			contentContainerStyle={{ paddingBottom: 96 }}
		/>
	)
}

export default SongListView
