/**
 * 下载页骨架（对齐桌面版）：筛选胶囊 + 任务行 + 空态 + 容量信息。
 * 真正的下载逻辑下一批接入，这里只做骨架与入口。
 */
import React, { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import StateView from '@/components/mac/StateView'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'

const FILTERS = ['所有任务', '正在下载', '已暂停', '出错', '下载完成'] as const

const DownloadsScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const [filter, setFilter] = useState<string>(FILTERS[0])
	const tasks = useMemo<any[]>(() => [], [])

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 8 }}>
				<Text style={{ color: c.textStrong, fontSize: macFont.display, fontWeight: '700' }}>下载</Text>
			</View>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flexGrow: 0, flexShrink: 0, marginTop: 12 }}
				contentContainerStyle={{ paddingHorizontal: macSpace.pageX, gap: 8 }}
			>
				{FILTERS.map(item => {
					const active = item === filter
					return (
						<Pressable
							key={item}
							onPress={() => setFilter(item)}
							style={{
								paddingHorizontal: 14,
								paddingVertical: 6,
								borderRadius: macRadius.pill,
								backgroundColor: active ? c.primary : c.fillSubtle,
							}}
						>
							<Text style={{ color: active ? '#fff' : c.text, fontSize: macFont.caption }}>{item}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			{tasks.length === 0 ? (
				<StateView mode="empty" title="暂无下载任务" hint="在歌曲上长按可选择下载（下载逻辑见后续版本）" />
			) : null}

			<View style={{ paddingHorizontal: macSpace.pageX, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: c.divider }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>已用空间 0 B · 可用空间 —</Text>
			</View>
		</View>
	)
}

export default DownloadsScreen
