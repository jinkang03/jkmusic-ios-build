import { FloatingPlayer } from '@/components/FloatingPlayer'
import { BlurTint } from '@/constants/tokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'
import { tr } from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { Tabs } from 'expo-router/js-tabs'
import React, { useMemo } from 'react'
import { useLiveActivity } from '@/hooks/useLiveActivity'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// 首页固定为「我的列表」（不再落到搜索页/歌曲页）
export const unstable_settings = { initialRouteName: 'favorites' }

// iOS 26/27 Apple Music 风格：底部导航是悬浮胶囊（左右留边、离底留白）
const TAB_BAR_HEIGHT = 58
const TAB_BAR_SIDE = 12
const TAB_BAR_BOTTOM = 8

const TabBarBackground = ({ tint, isDark }: { tint: BlurTint, isDark: boolean }) => (
	<View
		style={[
			StyleSheet.absoluteFill,
			{
				borderRadius: 29,
				overflow: 'hidden',
				borderWidth: StyleSheet.hairlineWidth,
				borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
			},
		]}
	>
		<BlurView intensity={95} tint={tint} style={StyleSheet.absoluteFill} />
	</View>
)

const TabsNavigation = () => {
	// 灵动岛 / 锁屏实时进度（旁路，不支持时静默跳过）
	useLiveActivity()
	const { bottom } = useSafeAreaInsets()
	const { blurTint, colors, isDark } = useAppTheme()
	const mac = macPalette(!!isDark)

	const floatingPlayerStyle = useMemo(() => ({
		position: 'absolute' as const,
		left: TAB_BAR_SIDE,
		right: TAB_BAR_SIDE,
		// 悬浮在导航胶囊上方，两者之间留 10pt
		bottom: TAB_BAR_HEIGHT + TAB_BAR_BOTTOM + Math.max(bottom, 8) + 10,
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
						// 10px：英文 "Downloads" 在 6 个 tab 下不会被截断
						fontSize: 10,
						fontWeight: '500',
					},
					headerShown: false,
					tabBarStyle: {
						position: 'absolute',
						left: TAB_BAR_SIDE,
						right: TAB_BAR_SIDE,
						bottom: Math.max(bottom, TAB_BAR_BOTTOM),
						height: TAB_BAR_HEIGHT,
						borderRadius: 29,
						borderTopWidth: 0,
						paddingTop: 7,
						paddingBottom: 7,
						backgroundColor: 'transparent',
						elevation: 0,
						// 悬浮胶囊的投影（iOS 用 shadow，Android 用 elevation=0 + 背景模糊）
						shadowColor: '#000',
						shadowOpacity: isDark ? 0.45 : 0.18,
						shadowRadius: 18,
						shadowOffset: { width: 0, height: 8 },
					},
					tabBarItemStyle: { paddingVertical: 2 },
					tabBarBackground: () => <TabBarBackground tint={blurTint} isDark={!!isDark} />,
				}}
			>
				{/* 顺序严格照桌面版：搜索 / 歌单 / 排行榜 / 我的列表 / 下载 / 设置 */}
				<Tabs.Screen
					name="search"
					options={{
						headerShown: false,
						title: tr('搜索', 'Search'),
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="songlist"
					options={{
						headerShown: false,
						title: tr('歌单', 'Playlists'),
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'albums' : 'albums-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="leaderboard"
					options={{
						headerShown: false,
						title: tr('排行榜', 'Charts'),
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="favorites"
					options={{
						headerShown: false,
						title: tr('我的列表', 'My Lists'),
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'heart' : 'heart-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="downloads"
					options={{
						headerShown: false,
						title: tr('下载', 'Downloads'),
						tabBarIcon: ({ color, focused }) => (
							<Ionicons name={focused ? 'download' : 'download-outline'} size={22} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="settings"
					options={{
						headerShown: false,
						title: tr('设置', 'Settings'),
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
