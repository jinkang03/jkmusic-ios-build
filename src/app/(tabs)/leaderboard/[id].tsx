/**
 * 榜单详情：拉取指定榜单的歌曲并用统一的 TracksList 展示。
 */
import { TracksList } from '@/components/TracksList'
import { useAppTheme } from '@/hooks/useAppTheme'
import { jkToTrack } from '@/jk/adapt'
import { getBoardDetail } from '@/jk/musicSdk'
import type { JKSource } from '@/jk/musicSdk'
import { useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import type { Track } from '@/player/types'

const BoardDetailScreen = () => {
	const { colors } = useAppTheme()
	const params = useLocalSearchParams<{ id: string, source?: string }>()
	const source = (params.source ?? 'kw') as JKSource
	const [tracks, setTracks] = useState<Track[]>([])
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
			<TracksList id={`board_${source}_${params.id}`} tracks={tracks} />
		</View>
	)
}

export default BoardDetailScreen
