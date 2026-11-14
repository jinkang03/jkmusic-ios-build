/**
 * 设置页骨架（对齐桌面版）：14 个分区列表，每行 + >。
 * 分区内容（控件与持久化）下一批实现；桌面专属项标注「仅桌面版支持」。
 */
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'

// 分区 id 与桌面版对应，深链形如 jkmusic://settings/player
const SECTIONS: Array<{ id: string, title: string, hint?: string }> = [
	{ id: 'basic', title: '基本设置' },
	{ id: 'player', title: '播放设置' },
	{ id: 'detail', title: '播放详情页设置' },
	{ id: 'desktopLyric', title: '桌面歌词设置', hint: '仅桌面版支持' },
	{ id: 'search', title: '搜索设置' },
	{ id: 'list', title: '列表设置' },
	{ id: 'download', title: '下载设置' },
	{ id: 'hotkey', title: '快捷键设置', hint: '仅桌面版支持' },
	{ id: 'sync', title: '数据同步' },
	{ id: 'openapi', title: '开放 API', hint: '仅桌面版支持' },
	{ id: 'network', title: '网络设置' },
	{ id: 'ocd', title: '强迫症设置' },
	{ id: 'backup', title: '备份与恢复' },
	{ id: 'other', title: '其他' },
]

const SettingsScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const router = useRouter()

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 8 }}>
				<Text style={{ color: c.textStrong, fontSize: macFont.display, fontWeight: '700' }}>设置</Text>
			</View>
			<ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
				{SECTIONS.map(section => (
					<Pressable
						key={section.id}
						onPress={() => router.push(`/settingSection/${section.id}` as any)}
						style={({ pressed }) => ({
							flexDirection: 'row',
							alignItems: 'center',
							justifyContent: 'space-between',
							paddingHorizontal: macSpace.pageX,
							height: 52,
							backgroundColor: pressed ? c.fillSubtle : 'transparent',
							borderBottomWidth: 0.5,
							borderBottomColor: c.divider,
						})}
					>
						<Text style={{ color: c.text, fontSize: macFont.body }}>{section.title}</Text>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
							{section.hint ? (
								<Text style={{ color: c.textMuted, fontSize: macFont.badge }}>{section.hint}</Text>
							) : null}
							<Text style={{ color: c.textMuted, fontSize: macFont.body }}>›</Text>
						</View>
					</Pressable>
				))}
			</ScrollView>
		</View>
	)
}

export default SettingsScreen
