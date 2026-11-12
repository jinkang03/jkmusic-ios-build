/**
 * 榜单页：数据来自 JKMUSIC 的 musicSdk（kw / kg / tx / wy / mg）。
 */
import { useAppTheme } from '@/hooks/useAppTheme'
import { getBoards, sources } from '@/jk/musicSdk'
import type { JKSource } from '@/jk/musicSdk'
import i18n from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native'

const BOARD_SOURCES: JKSource[] = ['kw', 'kg', 'tx', 'wy', 'mg']

interface Board {
	id: string
	name: string
	source: JKSource
}

const LeaderboardScreen = () => {
	const { colors } = useAppTheme()
	const router = useRouter()
	const [source, setSource] = useState<JKSource>('kw')
	const [boards, setBoards] = useState<Board[]>([])
	const [loading, setLoading] = useState(false)

	const load = useCallback(async(nextSource: JKSource) => {
		setLoading(true)
		try {
			const list = await getBoards(nextSource)
			setBoards(list as Board[])
		} catch (err) {
			console.log('load boards failed', err)
			setBoards([])
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void load(source)
	}, [source, load])

	const tabs = useMemo(
		() => BOARD_SOURCES.map(item => ({
			id: item,
			label: sources.find(s => s.id === item)?.name ?? item,
		})),
		[],
	)

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}>
				{tabs.map(tab => {
					const active = tab.id === source
					return (
						<Pressable
							key={tab.id}
							onPress={() => setSource(tab.id)}
							style={{
								paddingHorizontal: 14,
								paddingVertical: 6,
								borderRadius: 999,
								backgroundColor: active ? colors.primary : colors.surface,
							}}
						>
							<Text style={{ color: active ? '#fff' : colors.text, fontSize: 13 }}>{tab.label}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			{loading ? (
				<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
					<ActivityIndicator color={colors.loading} />
				</View>
			) : (
				<FlatList
					data={boards}
					keyExtractor={item => item.id}
					contentContainerStyle={{ padding: 12, gap: 8 }}
					renderItem={({ item }) => (
						<Pressable
							onPress={() => router.push(`/(tabs)/leaderboard/${item.id}?source=${item.source}` as any)}
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								justifyContent: 'space-between',
								padding: 14,
								borderRadius: 12,
								backgroundColor: colors.surface,
							}}
						>
							<Text style={{ color: colors.text, fontSize: 15 }}>{item.name}</Text>
							<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
						</Pressable>
					)}
					ListEmptyComponent={(
						<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
							{i18n.t('find.noMoreResults')}
						</Text>
					)}
				/>
			)}
		</View>
	)
}

export default LeaderboardScreen
