import { logInfo } from '@/helpers/logger'
/**
 * 列表详情：展示某个 JKMUSIC 列表内的歌曲。
 */
import SongListView from '@/components/mac/SongListView'
import { useAppTheme } from '@/hooks/useAppTheme'
import { jkToTrack } from '@/jk/adapt'
import { getListById } from '@/jk/libraryStore'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { tr } from '@/utils/i18n'
import React, { useMemo } from 'react'
import { Text, View } from 'react-native'

const ListDetailScreen = () => {
	const { colors } = useAppTheme()
	const params = useLocalSearchParams<{ name: string, play?: string, index?: string, t?: string }>()
	const listId = decodeURIComponent(String(params.name ?? '')).trim()
	// 深链播放：jkmusic://favorites/t1?play=1&index=0
	const autoPlayIndex = String(params.play ?? '') === '1'
		? Math.max(0, Number(params.index ?? 0) || 0)
		: undefined

	const [focusVer, setFocusVer] = React.useState(0)
	// 必须用 useFocusEffect：深链重进同一 listId 时页面不卸载，useEffect 不会重跑
	useFocusEffect(React.useCallback(() => { setFocusVer(v => v + 1) }, [listId]))
	const tracks = useMemo(() => {
		const list = getListById(listId)
		logInfo('[fav] listId=', listId, 'count=', list.length)
		if (list.length) {
			const f: any = list[0]
			logInfo('[fav] first id=', String(f?.id ?? ''), 'source=', String(f?.source ?? ''),
				'songmid=', String(f?.meta?.songmid ?? ''), 'metaKeys=', Object.keys(f?.meta ?? {}).join(','))
		}
		return list.map(jkToTrack)
		// 依赖 listId + focusVer：返回页面时重新读 store（外部新增的歌能显示）
	}, [listId, focusVer])

	if (!tracks.length) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
				<Text style={{ color: colors.textMuted }}>{tr('列表还是空的', 'This list is empty')}</Text>
			</View>
		)
	}

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<SongListView tracks={tracks} queueId={`mylist_${listId}`} autoPlayIndex={autoPlayIndex} showActions emptyText={tr('列表还是空的', 'This list is empty')} />
		</View>
	)
}

export default ListDetailScreen
