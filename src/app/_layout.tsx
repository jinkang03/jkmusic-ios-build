// 必须最先加载：为 JKMUSIC 的 musicSdk 提供全局 Buffer / TextEncoder
import '@/shims/globalPolyfills'
import { ensureDefaults } from '@/jk/settingsStore'
import { playbackService } from '@/constants/playbackService'
import { AppThemeProvider, useAppTheme } from '@/hooks/useAppTheme'
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
	const { colors, isDark, statusBarStyle } = useAppTheme()
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

	return (
		<SafeAreaProvider>
			<GestureHandlerRootView style={{ flex: 1 }}>
				<ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
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

	return (
		//每个 Stack.Screen 组件定义了一个可导航的屏幕
		<Stack key={language}>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen
				name="player"
				options={{
					presentation: 'card',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: false,
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
	)
}

// 首次启动写入桌面版默认设置（幂等）
try {
	ensureDefaults()
} catch (err) {
	console.log('[jk/settings] ensureDefaults failed', err)
}

export default App
