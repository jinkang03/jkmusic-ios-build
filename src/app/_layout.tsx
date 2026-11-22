// 必须最先加载：为 JKMUSIC 的 musicSdk 提供全局 Buffer / TextEncoder
import '@/shims/globalPolyfills'
import { ensureDefaults } from '@/jk/settingsStore'
import { textColorStore } from '@/jk/themeStore'
import { playbackService } from '@/constants/playbackService'
import { AppThemeProvider, ThemeOverrideProvider, useAppTheme, usePageTheme } from '@/hooks/useAppTheme'
import WallpaperBackground from '@/components/WallpaperBackground'
import LyricManager from '@/helpers/lyricManager'
import { useLogTrackPlayerState } from '@/hooks/useLogTrackPlayerState'
import { useSetupTrackPlayer } from '@/hooks/useSetupTrackPlayer'
import i18n, { nowLanguage, setI18nConfig, tr } from '@/utils/i18n'
import {
	DarkTheme,
	DefaultTheme,
	router,
	SplashScreen,
	Stack,
	ThemeProvider,
	usePathname,
	useRootNavigationState,
} from 'expo-router'
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message'
import TrackPlayer from '@rntp/player'
SplashScreen.preventAutoHideAsync()

TrackPlayer.registerPlaybackSession(playbackService)
setI18nConfig()
const App = () => {
	const handleTrackPlayerLoaded = useCallback(() => {
		void SplashScreen.hideAsync()
	}, [])

	// 导航就绪后立刻撤启动屏 + 落到「我的列表」。
	// 不能在第一帧就 hide：JS 内容还没渲染，会变成纯黑屏。
	const rootState = useRootNavigationState()
	const pathname = usePathname()
	const routedHomeRef = useRef(false)
	useEffect(() => {
		if (!rootState?.key) return
		void SplashScreen.hideAsync()
		if (routedHomeRef.current) return
		const p = String(pathname ?? '')
		if (!p || p === '/' || p === '/songs' || p.includes('(songs)')) {
			routedHomeRef.current = true
			try { router.replace('/(tabs)/favorites' as any) } catch { /* ignore */ }
		}
	}, [rootState?.key, pathname])

	useSetupTrackPlayer({
		onLoad: handleTrackPlayerLoaded, //播放器初始化后调用这个回调函数。这里先传过去。
	})

	useLogTrackPlayerState()
	useEffect(() => {
		void LyricManager.setup()
		// 已有壁纸但没记录主色（老版本/迁移）：补提取一次，作为默认强调色
		void import('@/jk/themeStore').then(m => m.ensureWallpaperAccent()).catch(() => undefined)
	}, [])
	return (
		<ShareIntentProvider
			options={{
				debug: true,
				resetOnBackground: false,
				onResetShareIntent: () =>
					// used when app going in background and when the reset button is pressed
					router.replace({
						pathname: '/',
					}),
			}}
		>
			<AppThemeProvider>
				<ThemedAppShell />
			</AppThemeProvider>
		</ShareIntentProvider>
	)
}

const ThemedAppShell = () => {
	// 功能页固定浅色透感，不跟随系统深浅（播放页自己 override 为深色）
	const { colors, isDark, statusBarStyle, wallpaper } = usePageTheme()
	const { hasShareIntent } = useShareIntentContext()
	const navigationState = useRootNavigationState()

	useEffect(() => {
		if (navigationState?.key && hasShareIntent) {
			router.replace('/(modals)/cymusic')
		}
	}, [hasShareIntent, navigationState?.key])

	const toastConfig = useMemo(
		() => ({
			success: (props) => (
				<BaseToast
					{...props}
					style={{
						borderLeftColor: colors.toastAccent,
						backgroundColor: colors.toastBackground,
					}}
					contentContainerStyle={{ paddingHorizontal: 15 }}
					text1Style={{
						fontSize: 15,
						fontWeight: '400',
						color: colors.toastAccent,
					}}
					text2Style={{
						fontSize: 15,
						fontWeight: '400',
						color: colors.toastAccent,
					}}
				/>
			),
			error: (props) => (
				<ErrorToast
					{...props}
					style={{
						borderLeftColor: colors.toastAccent,
						backgroundColor: colors.toastBackground,
					}}
					contentContainerStyle={{ paddingHorizontal: 15 }}
					text1Style={{
						fontSize: 15,
						fontWeight: '400',
						color: colors.toastAccent,
					}}
					text2Style={{
						fontSize: 15,
						fontWeight: '400',
						color: colors.toastAccent,
					}}
				/>
			),
		}),
		[colors],
	)

	// 壁纸开启时导航层背景必须透明，否则 Stack/Tabs 的场景实色底会挡住壁纸；
	// 没开壁纸时保持原来的实色，避免任何页面漏出底层黑底。
	const wallpaperOn = !!wallpaper?.uri
	const navTheme = useMemo(() => {
		const base = isDark ? DarkTheme : DefaultTheme
		if (!wallpaperOn) return base
		return {
			...base,
			colors: { ...base.colors, background: 'transparent', card: 'transparent' },
		}
	}, [isDark, wallpaperOn])

	return (
		<SafeAreaProvider>
			{/* 无壁纸时的浅色保底底；有壁纸时被 WallpaperBackground 覆盖 */}
			<GestureHandlerRootView style={{ flex: 1, backgroundColor: '#F7F7F9' }}>
				{/* 功能页面壁纸（最底层；play 页不受影响） */}
				<WallpaperBackground />
				<ThemeProvider value={navTheme}>
					<RootNavigation />
				</ThemeProvider>
				<StatusBar style={statusBarStyle} />
				<Toast config={toastConfig} />
			</GestureHandlerRootView>
		</SafeAreaProvider>
	)
}

const RootNavigation = () => {
	const { colors } = useAppTheme()
	// 语言切换后重建整棵导航树：i18n.t 是同步取值，不重建不会刷新已挂载页面
	const language = nowLanguage.useValue()
	// 订阅文字颜色：各页 header 的颜色在渲染时读取，不订阅改了不会立刻刷新
	void textColorStore.useValue()

	return (
		//每个 Stack.Screen 组件定义了一个可导航的屏幕
		// 功能页统一浅色；player 页内部会再 override 成 dark
		<ThemeOverrideProvider resolvedTheme="light">
		<Stack
			key={language}
			// 页面本身透明：壁纸清晰可见，玻璃质感只由卡片/胶囊的 glass 提供。
			// 之前这里加过 rgba(255,255,255,0.72)，等于给整页盖了一层白，
			// 导致「玻璃不透明度调到 0 还是白的」，也盖住了壁纸。
			screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}
		>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen
				name="player"
				options={{
					presentation: 'card',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: false,
					// 播放页背景来自封面，不要被浅色底覆盖
					contentStyle: { backgroundColor: 'transparent' },
				}}
			/>
			<Stack.Screen
				name="(modals)/playList"
				options={{
					presentation: 'modal',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: false,
				}}
			/>
			<Stack.Screen
				name="(modals)/changeSource"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
					gestureDirection: 'vertical',
				}}
			/>
			<Stack.Screen
				name="(modals)/addToPlaylist"
				options={{
					presentation: 'modal',
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitle: i18n.t('addToPlaylist.title'),
					headerTitleStyle: {
						color: colors.text,
					},
				}}
			/>
			<Stack.Screen
				name="(modals)/settingModal"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
					gestureDirection: 'vertical',
				}}
			/>
			<Stack.Screen
				name="(modals)/importPlayList"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
					gestureDirection: 'vertical',
				}}
			/>
			<Stack.Screen
				name="(modals)/[name]"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
					gestureDirection: 'vertical',
				}}
			/>
			<Stack.Screen
				name="settingSection/[section]"
				options={{ headerShown: false }}
			/>
			<Stack.Screen
				name="sourceManage"
				options={{ headerShown: false }}
			/>
			<Stack.Screen
				name="logScreen"
				options={{
					presentation: 'card',
					headerShown: true,
					headerTitle: tr('应用日志', 'App Logs'),
				}}
			/>
			<Stack.Screen
				name="(modals)/logScreen"
				options={{
					presentation: 'modal',
					headerShown: true,
					gestureEnabled: true,
					gestureDirection: 'vertical',
					headerTitle: tr('应用日志', 'App Logs'),
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitleStyle: {
						color: colors.text,
					},
				}}
			/>
		</Stack>
		</ThemeOverrideProvider>
	)
}

// 首次启动写入桌面版默认设置（幂等）
try {
	ensureDefaults()
} catch (err) {
	console.log('[jk/settings] ensureDefaults failed', err)
}

export default App
