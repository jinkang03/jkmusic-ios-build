/**
 * 统一的歌曲列表视图：把「五列 SongRow」和「播放/队列」接在一起。
 *
 * 播放逻辑全部复用 myTrackPlayer 的现成 API（与 TracksList 一致），
 * 这里只负责渲染与把点击事件转成 playWithReplacePlayList，不自己维护队列。
 */
import React, { useEffect, useRef } from 'react'
import { tr } from '@/utils/i18n'
import { FlatList, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { logInfo } from '@/helpers/logger'
import { macPalette } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import SongRow, { SongRowHeader } from './SongRow'
import { TrackShortcutsMenu } from '@/components/TrackShortcutsMenu'
import StateView from './StateView'
import { useSetting } from '@/jk/settingsStore'
import { sourceLabel } from '@/jk/sourceLabels'
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
	/** 用户点击某行（无论播放与否）时回调，用于记录历史等 */
	onTrackPress?: () => void
	/** 行右侧显示「⋯」操作菜单（收藏 / 添加到歌单 / 播放列表） */
	showActions?: boolean
	/** 下载子目录：歌单名（搜索/排行榜等不传 → 试听） */
	listName?: string
	/** 当前歌单 id：传入后行菜单会出现「删除」并从歌单移除 */
	listId?: string
}

const SongListView = ({ tracks, queueId, autoPlayIndex, emptyText, onTrackPress, showActions, listName, listId }: SongListViewProps) => {
	const c = macPalette(!!useAppTheme().isDark)
	const router = useRouter()
	const params = useLocalSearchParams<{ t?: string }>()
	const currentMusic: any = myTrackPlayer.useCurrentMusic()
	// 桌面版「显示来源」「显示源名」两个设置：角标是否显示、显示中文名还是平台代号
	const [showSource] = useSetting('list.isShowSource', true)
	const [sourceNameType] = useSetting('common.sourceNameType', 'alias')
	const lastAutoPlayTokenRef = useRef<string | null>(null)

	// 深链自动播放：只触发一次
	// 用「令牌」而不是布尔：同一路由生命周期内 index 变化或带不同 t 参数都要能重新触发，
	// 否则深链批量播放从第二次起会静默失效（P47 的教训）
	const autoPlayToken = `${autoPlayIndex ?? ''}:${String((params as any)?.t ?? '')}`
	useEffect(() => {
		if (autoPlayIndex == null || autoPlayIndex < 0) return
		if (!tracks.length) return
		if (lastAutoPlayTokenRef.current === autoPlayToken) return
		const idx = Math.max(0, Math.min(tracks.length - 1, autoPlayIndex))
		const target: any = tracks[idx]
		if (!target) return
		lastAutoPlayTokenRef.current = autoPlayToken
		logInfo(`[jk/play] auto-play index=${idx} t=${String((params as any)?.t ?? '')}`)
		void myTrackPlayer.playWithReplacePlayList(target, tracks as any)
	}, [autoPlayToken, tracks])

	const isCurrent = (track: any) => {
		if (!currentMusic) return false
		return String(currentMusic.id) === String(track.id) && String(currentMusic.platform) === String(track.platform)
	}

	if (!tracks.length) {
		return <StateView mode="empty" title={emptyText ?? tr('暂无歌曲', 'No songs')} />
	}

	return (
		<FlatList
			ListHeaderComponent={<SongRowHeader />}
			stickyHeaderIndices={undefined}
			data={tracks}
			keyExtractor={(item: any, index) => `${item?.id ?? index}-${item?.platform ?? ''}`}
			renderItem={({ item, index }) => {
				const active = isCurrent(item)
				const row = (
					<SongRow
						index={index + 1}
						title={item?.title ?? item?.name ?? ''}
						artist={item?.artist ?? item?.singer ?? ''}
						album={item?.album ?? item?.meta?.albumName ?? ''}
						duration={formatDuration(item?.duration ?? item?.interval)}
						badge={showSource && item?.platform
							? sourceLabel(String(item.platform), true, sourceNameType === 'real' ? 'real' : 'alias')
							: undefined}
						active={active}
						onPress={() => {
							onTrackPress?.()
							if (active) {
								router.push('/player' as any)
								return
							}
							// 队列完全交给 playWithReplacePlayList 建立（与 TracksList 一致）
							void myTrackPlayer.playWithReplacePlayList(item, tracks as any)
						}}
					/>
				)
				if (!showActions) return row
				return (
					<View style={{ flexDirection: 'row', alignItems: 'center' }}>
						<View style={{ flex: 1 }}>{row}</View>
						<TrackShortcutsMenu
							track={item as any}
							listName={listName}
							allowDelete={!!listId}
							onDeleteTrack={(id) => {
								if (!listId) return
								void import('@/jk/libraryStore').then(async m => {
									m.removeFromList(listId, [String(id)])
									const { showToast } = await import('@/utils/utils')
									showToast(tr('已移除', 'Removed'), String((item as any)?.title ?? ''), 'success')
								}).catch(() => undefined)
							}}
						>
							<View style={{ width: 32, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 }}>
								<Text style={{ color: c.textMuted, fontSize: 18 }}>⋯</Text>
							</View>
						</TrackShortcutsMenu>
					</View>
				)
			}}
			removeClippedSubviews
			initialNumToRender={14}
			windowSize={7}
			maxToRenderPerBatch={14}
			contentContainerStyle={{ paddingBottom: 176 }}
		/>
	)
}

export default SongListView
