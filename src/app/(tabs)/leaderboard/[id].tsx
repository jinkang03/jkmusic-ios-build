/**
 * 榜单详情：拉取指定榜单的歌曲并用统一的 TracksList 展示。
 */
import SongListView from '@/components/mac/SongListView'
import { useAppTheme } from '@/hooks/useAppTheme'
import { jkToTrack } from '@/jk/adapt'
import { getBoardDetail } from '@/jk/musicSdk'
import type { JKSource } from '@/jk/musicSdk'
import { useLocalSearchParams } from 'expo-router'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { logInfo } from '@/helpers/logger'
import React, { useEffect, useState, useRef } from 'react'
import { ActivityIndicator, View } from 'react-native'
import type { Track } from '@/player/types'

const BoardDetailScreen = () => {
	const { colors } = useAppTheme()
	const params = useLocalSearchParams<{ id: string, source?: string, play?: string, index?: string }>()
	const source = (params.source ?? 'kw') as JKSource
	const [tracks, setTracks] = useState<Track[]>([])

	const autoPlayIndex = String(params.play ?? '') === '1'
		? Math.max(0, Number(params.index ?? 0) || 0)
		: undefined
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let cancelled = false
		void (async() => {
			setLoading(true)
			try {
				const detail = await getBoardDetail(source, params.id, 1)
				if (cancelled) return
				setTracks(detail.list.map(jkToTrack))
			} catch (err) {
				console.log('board detail failed', err)
				if (!cancelled) setTracks([])
			} finally {
				if (!cancelled) setLoading(false)
			}
		})()
		return () => { cancelled = true }
	}, [source, params.id])

	if (loading) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
				<ActivityIndicator color={colors.loading} />
			</View>
		)
	}

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<SongListView tracks={tracks} queueId={`leaderboard_${source}_${params.id}`} autoPlayIndex={autoPlayIndex} />
		</View>
	)
}

export default BoardDetailScreen
