/**
 * 排序歌单：控制「我的列表」里歌单的排列顺序（含内置的试听列表 / 我的收藏）。
 *
 * 顺序存在 libraryStore（MMKV: jk_library / listOrder），每点一次上移/下移立即落盘，
 * 返回「我的列表」就生效（那边订阅 libraryVersionStore）。
 */
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { glass } from '@/constants/glass'
import { usePageTheme } from '@/hooks/useAppTheme'
import { logInfo } from '@/helpers/logger'
import { tr } from '@/utils/i18n'
import {
	LIST_IDS,
	applyListOrder,
	getDefaultList,
	getLoveList,
	getUserLists,
	moveListBy,
} from '@/jk/libraryStore'

type Row = { id: string, name: string, count: number, builtin: boolean }

const SortPlaylistsScreen = () => {
	const { isDark, glassAlpha, colors: pageColors } = usePageTheme()
	const c = macPalette(!!isDark)
	const g = glass(!!isDark, Number(glassAlpha ?? 0.55))
	const insets = useSafeAreaInsets()
	const router = useRouter()
	const [version, setVersion] = React.useState(0)

	const rows = React.useMemo<Row[]>(() => {
		void version
		const userLists = getUserLists()
		const all: Row[] = [
			{ id: LIST_IDS.DEFAULT, name: tr('试听列表', 'Listening'), count: getDefaultList().length, builtin: true },
			{ id: LIST_IDS.LOVE, name: tr('我的收藏', 'Favorites'), count: getLoveList().length, builtin: true },
			...userLists.map(item => ({ id: item.id, name: item.name, count: item.list.length, builtin: false })),
		]
		// applyListOrder 会按已保存顺序排列，并把没记录过的补在后面
		return applyListOrder(all)
	}, [version])

	const move = (id: string, name: string, delta: number) => {
		moveListBy(id, delta)
		setVersion(v => v + 1)
		logInfo('[library] sort move', name, delta > 0 ? 'down' : 'up')
	}

	return (
		<View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.22)', paddingTop: insets.top }}>
			<View style={{
				flex: 1,
				marginTop: 18,
				borderTopLeftRadius: 22,
				borderTopRightRadius: 22,
				backgroundColor: g.fill,
				borderWidth: 1,
				borderColor: g.stroke,
				overflow: 'hidden',
			}}>
				<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: macSpace.pageX, height: 52 }}>
					<Pressable onPress={() => router.back()} hitSlop={8}>
						<Text style={{ color: c.primary, fontSize: macFont.body }}>{tr('返回', 'Back')}</Text>
					</Pressable>
					<Text style={{ color: pageColors.text, fontSize: macFont.display, fontWeight: '700', marginLeft: 12 }}>
						{tr('排序歌单', 'Sort Playlists')}
					</Text>
				</View>
				<Text style={{ color: pageColors.textMuted, fontSize: macFont.caption, paddingHorizontal: macSpace.pageX, paddingBottom: 10 }}>
					{tr('点箭头调整顺序，立即生效', 'Tap the arrows to reorder. Changes apply immediately.')}
				</Text>
				<ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
					{rows.map((item, index) => (
						<View
							key={item.id}
							style={{
								flexDirection: 'row', alignItems: 'center',
								paddingHorizontal: macSpace.pageX, height: 56,
								borderTopWidth: index === 0 ? 0 : 0.5,
								borderTopColor: g.stroke,
							}}
						>
							<View style={{ width: 26 }}>
								<Text style={{ color: pageColors.textMuted, fontSize: macFont.caption }}>{index + 1}</Text>
							</View>
							<View style={{ flex: 1 }}>
								<Text numberOfLines={1} style={{ color: pageColors.text, fontSize: macFont.body }}>
									{item.name}
								</Text>
								<Text style={{ color: pageColors.textMuted, fontSize: macFont.badge, marginTop: 2 }}>
									{tr('共', '')} {item.count} {tr('首', 'songs')}
									{item.builtin ? ` · ${tr('内置', 'Built-in')}` : ''}
								</Text>
							</View>
							<Pressable
								onPress={() => move(item.id, item.name, -1)}
								disabled={index === 0}
								hitSlop={6}
								style={({ pressed }) => ({
									width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
									borderRadius: macRadius.pill,
									backgroundColor: pressed ? c.fillSubtle : 'transparent',
									opacity: index === 0 ? 0.25 : 1,
								})}
							>
								<Text style={{ color: pageColors.text, fontSize: 18 }}>↑</Text>
							</Pressable>
							<Pressable
								onPress={() => move(item.id, item.name, 1)}
								disabled={index === rows.length - 1}
								hitSlop={6}
								style={({ pressed }) => ({
									width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
									borderRadius: macRadius.pill,
									backgroundColor: pressed ? c.fillSubtle : 'transparent',
									opacity: index === rows.length - 1 ? 0.25 : 1,
								})}
							>
								<Text style={{ color: pageColors.text, fontSize: 18 }}>↓</Text>
							</Pressable>
						</View>
					))}
				</ScrollView>
			</View>
		</View>
	)
}

export default SortPlaylistsScreen
