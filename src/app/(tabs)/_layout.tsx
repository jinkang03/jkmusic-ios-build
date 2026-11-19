import { FloatingPlayer } from '@/components/FloatingPlayer'
import { BlurTint } from '@/constants/tokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'
import i18n from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { Tabs } from 'expo-router/js-tabs'
import React, { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// 首页固定为「我的列表」（不再落到搜索页/歌曲页）
export const unstable_settings = { initialRouteName: 'favorites' }

const TAB_BAR_HEIGHT = 49

const TabBarBackground = ({ tint }: { tint: BlurTint }) => (
	<BlurView
		intensity={90}
		tint={tint}
		style={[
			StyleSheet.absoluteFill,
			{
				overflow: 'hidden',
				borderTopLeftRadius: 20,
				borderTopRightRadius: 20,
			},
		]}
	/>
)

const TabsNavigation = () => {
	const { bottom } = useSafeAreaInsets()
	const { blurTint, colors, isDark } = useAppTheme()
	const mac = macPalette(!!isDark)

	const floatingPlayerStyle = useMemo(() => ({
		position: 'absolute' as const,
		left: 8,
		right: 8,
		bottom: TAB_BAR_HEIGHT + bottom + 8,
	}), [bottom])

	return (
		<>
			<Tabs
				initialRouteName="favorites"
				screenOptions={{
					// 选中色以 macTokens 为准（spec: #E240F7），不再取主题的 colors.primary
					tabBarActiveTintColor: mac.primary,
					tabBarInactiveTintColor: mac.textMuted,
					tabBarLabelStyle: {
						fontSize: 11,
						fontWeight: '500',
					},
					headerShown: false,
					tabBarStyle: {
						position: 'absolute',
						borderTopLeftRadius: 20,
						borderTopRightRadius: 20,
						borderTopWidth: 0,
						paddingTop: 6,
						backgroundColor: 'transparent',
					},
					tabBarBackground: () => <TabBarBackground tint={blurTint} />,
				}}
			>
				{/* 顺序严格照桌面版：搜索 / 歌单 / 排行榜 / 我的列表 / 下载 / 设置 */}
				<Tabs.Screen
					name="search"
					options={{
						headerShown: false,
						title: '搜索',
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="songlist"
					options={{
						headerShown: false,
						title: '歌单',
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'albums' : 'albums-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="leaderboard"
					options={{
						headerShown: false,
						title: '排行榜',
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="favorites"
					options={{
						headerShown: false,
						title: '我的列表',
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'heart' : 'heart-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="downloads"
					options={{
						headerShown: false,
						title: '下载',
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'download' : 'download-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="settings"
					options={{
						headerShown: false,
						title: '设置',
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'settings' : 'settings-outline'} size={22} color={color} />
						),
					}}
				/>
				{/* 桌面版没有「音乐」首页与电台，隐藏但保留路由，避免深链失效 */}
				<Tabs.Screen name="(songs)" options={{ href: null }} />
				<Tabs.Screen name="radio" options={{ href: null }} />
			</Tabs>

			<FloatingPlayer style={floatingPlayerStyle} />
		</>
	)
}

export default TabsNavigation
