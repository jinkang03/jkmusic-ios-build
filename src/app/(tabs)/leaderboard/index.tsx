/**
 * 排行榜主页（对齐桌面版 mac-leaderboard.png）：
 * 大标题 + 源胶囊行 + 榜单横向胶囊 + 选中榜单的歌曲列表（复用 SongListView）。
 * 数据仍走 getBoards / getBoardDetail，不改调用方式。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import SongListView from '@/components/mac/SongListView'
import StateView from '@/components/mac/StateView'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { glass } from '@/constants/glass'
import { useAppTheme } from '@/hooks/useAppTheme'
import { getBoardDetail, getBoards } from '@/jk/musicSdk'
import type { JKSource } from '@/jk/musicSdk'
import { sourceLabel } from '@/jk/sourceLabels'
import { tr } from '@/utils/i18n'
import { logError } from '@/helpers/logger'

const BOARD_SOURCES: JKSource[] = ['kw', 'kg', 'tx', 'wy', 'mg']

interface Board { id: string, name: string, source: JKSource }

const LeaderboardScreen = () => {
	const { isDark, glassAlpha } = useAppTheme()
	const g = glass(!!isDark, Number(glassAlpha ?? 0.55))
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const params = useLocalSearchParams<{ source?: string }>()
	const initialSource = (BOARD_SOURCES as string[]).includes(String(params.source))
		? (params.source as JKSource)
		: 'kw'

	const [source, setSource] = useState<JKSource>(initialSource)
	const [boards, setBoards] = useState<Board[]>([])
	const [activeBoard, setActiveBoard] = useState<string>('')
	const [tracks, setTracks] = useState<any[]>([])
	const [boardsLoading, setBoardsLoading] = useState(false)
	const [detailLoading, setDetailLoading] = useState(false)

	// 榜单列表
	useEffect(() => {
		let cancelled = false
		setBoardsLoading(true)
		void (async() => {
			try {
				const list = await getBoards(source)
				if (cancelled) return
				setBoards(list as Board[])
				setActiveBoard((list as Board[])[0]?.id ?? '')
			} catch (err) {
				logError('[leaderboard] getBoards failed', String((err as any)?.message ?? err))
				if (!cancelled) { setBoards([]); setActiveBoard('') }
			} finally {
				if (!cancelled) setBoardsLoading(false)
			}
		})()
		return () => { cancelled = true }
	}, [source])

	// 选中榜单的歌曲
	const loadDetail = useCallback(async(nextSource: JKSource, boardId: string) => {
		if (!boardId) { setTracks([]); return }
		setDetailLoading(true)
		try {
			const res: any = await getBoardDetail(nextSource, boardId, 1)
			setTracks(res?.list ?? [])
		} catch (err) {
			logError('[leaderboard] getBoardDetail failed', String((err as any)?.message ?? err))
			setTracks([])
		} finally {
			setDetailLoading(false)
		}
	}, [])

	useEffect(() => {
		void loadDetail(source, activeBoard)
	}, [source, activeBoard, loadDetail])

	const sourceTabs = useMemo(
		// 平台胶囊始终中文：只有歌单内的歌曲行跟随「显示源名」设置
		() => BOARD_SOURCES.map(item => ({ id: item, label: sourceLabel(item, false, 'alias') })),
		[],
	)

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 8 }}>
				<Text style={{ color: c.textStrong, fontSize: macFont.display, fontWeight: '700' }}>{tr('排行榜', 'Charts')}</Text>
			</View>

			{/* 源胶囊行 */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flexGrow: 0, flexShrink: 0, marginTop: 12 }}
				contentContainerStyle={{ paddingHorizontal: macSpace.pageX, gap: 8 }}
			>
				{sourceTabs.map(tab => {
					const active = tab.id === source
					return (
						<Pressable
							key={tab.id}
							onPress={() => setSource(tab.id)}
							style={{
								paddingHorizontal: 14, paddingVertical: 6, borderRadius: macRadius.pill,
								backgroundColor: active ? c.primary : g.fill,
								borderColor: active ? c.primary : g.stroke,
							}}
						>
							<Text style={{ color: active ? '#fff' : c.text, fontSize: macFont.caption }}>{tab.label}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			{/* 榜单横向胶囊 */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flexGrow: 0, flexShrink: 0, marginTop: 8, marginBottom: 4 }}
				contentContainerStyle={{ paddingHorizontal: macSpace.pageX, gap: 8 }}
			>
				{boards.map(board => {
					const active = board.id === activeBoard
					return (
						<Pressable
							key={board.id}
							onPress={() => setActiveBoard(board.id)}
							style={{
								paddingHorizontal: 12, paddingVertical: 5, borderRadius: macRadius.pill,
								borderWidth: active ? 0 : 0.5, borderColor: c.divider,
								backgroundColor: active ? c.fillMuted : 'transparent',
							}}
						>
							<Text style={{ color: active ? c.primary : c.textMuted, fontSize: macFont.caption }}>{board.name}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			{boardsLoading || detailLoading ? (
				<StateView mode="loading" />
			) : (
				<SongListView
					tracks={tracks}
					queueId={`leaderboard_${source}_${activeBoard}`}
					emptyText={tr('该榜单暂无歌曲', 'No songs in this chart')}
				/>
			)}
		</View>
	)
}

export default LeaderboardScreen
