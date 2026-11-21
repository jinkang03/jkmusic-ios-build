/**
 * 添加到歌单（libraryStore 版）。
 * 歌曲来自模块级 pending（保留 meta.songmid/source/albumName），不用 URL 参数。
 */
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { logInfo } from '@/helpers/logger'
import { showToast } from '@/utils/utils'
import { tr } from '@/utils/i18n'
import { LIST_IDS, addToList, getUserLists } from '@/jk/libraryStore'
import { getSetting } from '@/jk/settingsStore'
import { takePendingMusic } from '@/jk/pendingMusic'
import { addToList as addToLibList } from '@/jk/libraryStore'

const AddToPlaylistScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const router = useRouter()

	const rows = React.useMemo(() => {
		const userLists = getUserLists().map(item => ({ id: item.id, name: item.name, count: item.list.length }))
		return [
			{ id: 'love', name: tr('我的收藏', 'Favorites'), count: 0 },
			{ id: LIST_IDS.DEFAULT, name: tr('试听列表', 'Listening'), count: 0 },
			...userLists,
		]
	}, [])

	const choose = (id: string, name: string) => {
		const m = takePendingMusic()
		if (!m) {
			logInfo('[addToPlaylist] pending empty! target=', id, name)
			showToast(tr('提示', 'Notice'), tr('没有待添加的歌曲', 'No songs to add'), 'info')
			router.back()
			return
		}
		// 插入位置跟随「添加音乐位置」设置（之前固定 bottom，选了顶部也不生效）
		const pos = getSetting('list.addMusicLocationType', 'top') as 'top' | 'bottom'
		if (id === 'love') addToLibList(LIST_IDS.LOVE, [m], pos)
		else addToList(id, [m], pos)
		logInfo('[addToPlaylist] added', m.id, 'source=', (m as any).source, 'to', id, name)
		showToast(tr('提示', 'Notice'), tr(`已添加到 ${name}`, `Added to ${name}`), 'success')
		router.back()
	}

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: macSpace.pageX, height: 52 }}>
				<Pressable onPress={() => router.back()}>
					<Text style={{ color: c.primary, fontSize: macFont.body }}>{tr('返回', 'Back')}</Text>
				</Pressable>
				<Text style={{ color: c.textStrong, fontSize: macFont.display, fontWeight: '700', marginLeft: 12 }}>{tr('添加到歌单', 'Add to Playlist')}</Text>
			</View>
			<ScrollView>
				{rows.map(item => (
					<Pressable
						key={item.id}
						onPress={() => choose(item.id, item.name)}
						style={({ pressed }) => ({
							flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
							paddingHorizontal: macSpace.pageX, height: 52,
							backgroundColor: pressed ? c.fillSubtle : 'transparent',
							borderBottomWidth: 0,
						})}
					>
						<Text style={{ color: c.text, fontSize: macFont.body }}>{item.name}</Text>
						<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>›</Text>
					</Pressable>
				))}
			</ScrollView>
		</View>
	)
}

export default AddToPlaylistScreen
