import { FloatingPlayer } from '@/components/FloatingPlayer'
import { BlurTint } from '@/constants/tokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'
import { glass } from '@/constants/glass'
import { tr } from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Tabs } from 'expo-router/js-tabs'
import React, { useMemo } from 'react'
import { useLiveActivity } from '@/hooks/useLiveActivity'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// 首页固定为「我的列表」（不再落到搜索页/歌曲页）
export const unstable_settings = { initialRouteName: 'favorites' }

// iOS 26/27 Apple Music 风格：底部导航是悬浮胶囊（左右留边、离底留白）
// 60 而不是 54：54 时 icon 34 + label 14 + 上下 padding 刚好溢出，
// 文字会压到底部圆角上（实测 1.4.x 的视觉问题）
const TAB_BAR_HEIGHT = 64
// 功能条与播放条视觉对齐：左右边距用同一个比例（0.027 ≈ 10pt）
const TAB_BAR_SIDE_RATIO = 0.027
const TAB_BAR_BOTTOM = 14
// 播放条水平长度 = 上一版 ×1.1（比功能条更宽）
const PLAYER_SIDE_RATIO = 0.027
/** (tabs) 下这两个是遗留路由，不能出现在导航条里 */
const HIDDEN_TAB_ROUTES = ['(songs)', 'radio']

/**
 * 自定义底部导航条。
 *
 * 为什么不用 tabBarStyle 的 left/width：@react-navigation/bottom-tabs 内部会给
 * tabBar 设成整行布局，`left/right/width` 多次实测都被覆盖（视觉上始终全宽）。
 * 自己渲染一个绝对定位的容器，宽度才真正可控。
 */
const CustomTabBar = ({ state, descriptors, navigation }: any) => {
	const { bottom } = useSafeAreaInsets()
	const { width: winWidth } = useWindowDimensions()
	const { isDark, glassAlpha } = useAppTheme()
	const mac = macPalette(!!isDark)
	// 功能条固定浅色玻璃：0=全透明，100=纯白
	const g = glass(false, Number(glassAlpha ?? 0.55))
	const side = Math.round(winWidth * TAB_BAR_SIDE_RATIO)
	// 高光强度跟随玻璃透明度：a=0 时完全没有白色，a=1 时最强
	const ga = Math.min(1, Math.max(0, Number(glassAlpha ?? 0.55)))
	return (
		<View
			pointerEvents="box-none"
			style={{
				position: 'absolute',
				left: side,
				right: side,
				bottom: Math.max(bottom, TAB_BAR_BOTTOM),
			}}
		>
			<View
				style={{
					height: TAB_BAR_HEIGHT,
					borderRadius: 26,
					overflow: 'hidden',
					borderWidth: 1,
					borderColor: g.stroke,
					backgroundColor: g.fill,
					flexDirection: 'row',
				}}
			>
				{ga > 0.02 ? (
					<BlurView intensity={Math.round(ga * 100)} tint="light" style={StyleSheet.absoluteFill} />
				) : null}
				{ga > 0.02 ? (
					<LinearGradient
						pointerEvents="none"
						colors={[`rgba(255,255,255,${(ga * 0.45).toFixed(3)})`, `rgba(255,255,255,${(ga * 0.08).toFixed(3)})`, 'transparent']}
						locations={[0, 0.4, 1]}
						style={StyleSheet.absoluteFill}
					/>
				) : null}
				{state.routes.filter((route: any) => !HIDDEN_TAB_ROUTES.includes(String(route.name))).map((route: any) => {
					const focused = route.key === state.routes[state.index]?.key
					const { options } = descriptors[route.key] ?? {}
					const color = focused ? mac.primary : mac.textMuted
					const label = String(options?.title ?? route.name ?? '')
					const onPress = () => {
						const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
						if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
					}
					return (
						<Pressable
							key={route.key}
							onPress={onPress}
							onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
							style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
						>
							<View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? `${mac.primary}24` : 'transparent' }}>
								{options?.tabBarIcon?.({ focused, color, size: 20 })}
							</View>
							<Text style={{ color, fontSize: 9, fontWeight: '500', marginTop: 1 }} numberOfLines={1}>{label}</Text>
						</Pressable>
					)
				})}
			</View>
		</View>
	)
}

const TabsNavigation = () => {
	// 灵动岛 / 锁屏实时进度（旁路，不支持时静默跳过）
	useLiveActivity()
	const { bottom } = useSafeAreaInsets()
	const { width: winWidth } = useWindowDimensions()
	// 功能条长度 0.8×、播放条长度 1.1×（按屏宽比例换算成左右边距）
	const tabBarSide = Math.round(winWidth * TAB_BAR_SIDE_RATIO)
	const playerSide = Math.round(winWidth * PLAYER_SIDE_RATIO)
	const { colors, isDark, glassAlpha } = useAppTheme()
	const mac = macPalette(!!isDark)

	const floatingPlayerStyle = useMemo(() => ({
		position: 'absolute' as const,
		left: playerSide,
		right: playerSide,
		// 悬浮在导航胶囊上方，两者之间留 10pt
		bottom: TAB_BAR_HEIGHT + TAB_BAR_BOTTOM + Math.max(bottom, 8) + 12,
	}), [bottom, playerSide])

	return (
		<>
			<Tabs
				initialRouteName="favorites"
				tabBar={(props: any) => <CustomTabBar {...props} />}
				screenOptions={{
					// tab 场景透明：背景由壁纸 + 卡片玻璃决定
					sceneStyle: { backgroundColor: 'transparent' },
					// 选中色以 macTokens 为准（spec: #E240F7），不再取主题的 colors.primary
					tabBarActiveTintColor: mac.primary,
					tabBarInactiveTintColor: mac.textMuted,
					tabBarLabelStyle: {
						// 10px：英文 "Downloads" 在 6 个 tab 下不会被截断
						fontSize: 10,
						fontWeight: '500',
						marginTop: 1,
					},
					headerShown: false,
					tabBarStyle: {
						position: 'absolute',
						left: tabBarSide,
						// 用显式 width 而不是 right：bottom-tabs 内部会覆盖 right/left 的一侧，
						// 只给 left+right 时视觉上仍是全宽（实测多次无效）
						width: Math.max(200, winWidth - tabBarSide * 2),
						bottom: Math.max(bottom, TAB_BAR_BOTTOM),
						height: TAB_BAR_HEIGHT,
						borderRadius: 26,
						borderTopWidth: 0,
						paddingTop: 0,
						paddingBottom: 0,
						backgroundColor: 'transparent',
						elevation: 0,
						// 悬浮胶囊的投影（iOS 用 shadow，Android 用 elevation=0 + 背景模糊）
						shadowColor: '#000',
						shadowOpacity: isDark ? 0.45 : 0.18,
						shadowRadius: 18,
						shadowOffset: { width: 0, height: 8 },
					},
					tabBarItemStyle: { paddingVertical: 0, justifyContent: 'center' },
				}}
			>
				{/* 顺序严格照桌面版：搜索 / 歌单 / 排行榜 / 我的列表 / 下载 / 设置 */}
				<Tabs.Screen
					name="search"
					options={{
						headerShown: false,
						title: tr('搜索', 'Search'),
						tabBarIcon: ({ color, focused }) => (
							<View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? `${mac.primary}24` : 'transparent' }}>
								<Ionicons name={focused ? 'search' : 'search-outline'} size={20} color={color} />
							</View>
						),
					}}
				/>
				<Tabs.Screen
					name="songlist"
					options={{
						headerShown: false,
						title: tr('歌单', 'Playlists'),
						tabBarIcon: ({ color, focused }) => (
							<View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? `${mac.primary}24` : 'transparent' }}>
								<Ionicons name={focused ? 'albums' : 'albums-outline'} size={20} color={color} />
							</View>
						),
					}}
				/>
				<Tabs.Screen
					name="leaderboard"
					options={{
						headerShown: false,
						title: tr('排行榜', 'Charts'),
						tabBarIcon: ({ color, focused }) => (
							<View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? `${mac.primary}24` : 'transparent' }}>
								<Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={20} color={color} />
							</View>
						),
					}}
				/>
				<Tabs.Screen
					name="favorites"
					options={{
						headerShown: false,
						title: tr('我的列表', 'My Lists'),
						tabBarIcon: ({ color, focused }) => (
							<View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? `${mac.primary}24` : 'transparent' }}>
								<Ionicons name={focused ? 'heart' : 'heart-outline'} size={20} color={color} />
							</View>
						),
					}}
				/>
				<Tabs.Screen
					name="downloads"
					options={{
						headerShown: false,
						title: tr('下载', 'Downloads'),
						tabBarIcon: ({ color, focused }) => (
							<View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? `${mac.primary}24` : 'transparent' }}>
								<Ionicons name={focused ? 'download' : 'download-outline'} size={20} color={color} />
							</View>
						),
					}}
				/>
				<Tabs.Screen
					name="settings"
					options={{
						headerShown: false,
						title: tr('设置', 'Settings'),
						tabBarIcon: ({ color, focused }) => (
							<View style={{ width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? `${mac.primary}24` : 'transparent' }}>
								<Ionicons name={focused ? 'settings' : 'settings-outline'} size={20} color={color} />
							</View>
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
