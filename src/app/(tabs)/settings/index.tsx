/**
 * 设置页骨架（对齐桌面版）：14 个分区列表，每行 + >。
 * 分区内容（控件与持久化）下一批实现；桌面专属项标注「仅桌面版支持」。
 */
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { musicApiSelectedStore } from '@/helpers/trackPlayerIndex'
import { useAppTheme } from '@/hooks/useAppTheme'

// 分区 id 与桌面版对应，深链形如 jkmusic://settings/player
import { SETTINGS_SECTIONS } from '@/jk/settingsSections'
import { tr } from '@/utils/i18n'

const SettingsScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const router = useRouter()
	const selectedSource = musicApiSelectedStore.useValue()
	const sourceLabel = selectedSource?.name ? String(selectedSource.name) : tr('未导入', 'Not imported')
	const mainSections = SETTINGS_SECTIONS.filter(section => !section.desktopOnly)

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 8 }}>
				<Text style={{ color: c.textStrong, fontSize: macFont.display, fontWeight: '700' }}>{tr('设置', 'Settings')}</Text>
			</View>
			<ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
				<Pressable
					onPress={() => router.push('/sourceManage' as any)}
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
					<Text style={{ color: c.text, fontSize: macFont.body }}>{tr('音源管理', 'Sources')}</Text>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, marginLeft: 12 }}>
						<Text numberOfLines={1} style={{ color: c.primary, fontSize: macFont.caption, flexShrink: 1 }}>{sourceLabel}</Text>
						<Text style={{ color: c.textMuted, fontSize: macFont.body }}>›</Text>
					</View>
				</Pressable>
				{mainSections.map(section => (
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
						<Text style={{ color: c.text, fontSize: macFont.body }}>{tr(section.zh, section.en)}</Text>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
							<Text style={{ color: c.textMuted, fontSize: macFont.body }}>›</Text>
						</View>
					</Pressable>
				))}
			</ScrollView>
		</View>
	)
}

export default SettingsScreen
