import PersistStatus from '@/store/PersistStatus'
import { GlobalState } from '@/utils/stateMapper'
import {
	ThemeColors,
	ThemeMode,
	ResolvedTheme,
	getRuntimeColors,
	getThemeColors,
	setRuntimeColors,
} from '@/constants/tokens'
import React, { ReactNode, createContext, useContext, useEffect, useMemo } from 'react'
import { Appearance, ColorSchemeName, useColorScheme } from 'react-native'

type AppThemeContextValue = {
	themeMode: ThemeMode
	resolvedTheme: ResolvedTheme
	colors: ThemeColors
	isDark: boolean
	blurTint: ThemeColors['blurTint']
	statusBarStyle: 'light' | 'dark'
	setThemeMode: (mode: ThemeMode) => void
	macTheme?: { id: string, primary: string }
	accent?: string
	wallpaper?: { uri: string, blur: number, opacity: number }
}

// 主题色变化要触发所有用 macPalette 的页面重渲染
import { macThemeStore, accentStore, wallpaperStore } from '@/jk/themeStore'
const storedThemeMode = PersistStatus.get('app.themeMode') ?? 'system'

export const themeModeStore = new GlobalState<ThemeMode>(storedThemeMode)

const AppThemeContext = createContext<AppThemeContextValue | null>(null)

const createThemeValue = (
	themeMode: ThemeMode,
	resolvedTheme: ResolvedTheme,
	setThemeModeValue: (mode: ThemeMode) => void,
): AppThemeContextValue => {
	const colors = getThemeColors(resolvedTheme)

	return {
		themeMode,
		resolvedTheme,
		colors,
		isDark: resolvedTheme === 'dark',
		blurTint: colors.blurTint,
		statusBarStyle: resolvedTheme === 'dark' ? 'light' : 'dark',
		setThemeMode: setThemeModeValue,
	}
}

const resolveTheme = (
	themeMode: ThemeMode,
	systemColorScheme: ColorSchemeName,
): ResolvedTheme => {
	if (themeMode === 'system') {
		return systemColorScheme === 'light' ? 'light' : 'dark'
	}

	return themeMode
}

export const setThemeMode = (mode: ThemeMode) => {
	PersistStatus.set('app.themeMode', mode)
	themeModeStore.setValue(mode)
}

export const AppThemeProvider = ({ children }: { children: ReactNode }) => {
	const systemColorScheme = useColorScheme()
	const themeMode = themeModeStore.useValue() ?? storedThemeMode
	// 订阅主题色：把它放进 context value 的依赖里，
	// 否则 context 引用不变，消费者不会重渲染（主题切换要等下一次导航才生效）
	const macTheme = macThemeStore.useValue()
	const accent = accentStore.useValue()
	// 壁纸/磨砂/透明度变化要立刻重算调色板（页面底色是半透明玻璃色）
	const wallpaper = wallpaperStore.useValue()
	const resolvedTheme = resolveTheme(themeMode, systemColorScheme)
	const themeValue = useMemo(
		() => ({ ...createThemeValue(themeMode, resolvedTheme, setThemeMode), macTheme, accent, wallpaper }),
		[resolvedTheme, themeMode, macTheme, accent, wallpaper],
	)

	if (getRuntimeColors() !== themeValue.colors) {
		setRuntimeColors(themeValue.colors)
	}

	useEffect(() => {
		Appearance.setColorScheme(themeMode === 'system' ? 'unspecified' : resolvedTheme)
	}, [resolvedTheme, themeMode])

	return <AppThemeContext.Provider value={themeValue}>{children}</AppThemeContext.Provider>
}

export const ThemeOverrideProvider = ({
	children,
	resolvedTheme,
}: {
	children: ReactNode
	resolvedTheme: ResolvedTheme
}) => {
	const parentTheme = useAppTheme()

	const value = useMemo(
		() => createThemeValue(parentTheme.themeMode, resolvedTheme, parentTheme.setThemeMode),
		[parentTheme.setThemeMode, parentTheme.themeMode, resolvedTheme],
	)

	return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

export const useAppTheme = () => {
	const value = useContext(AppThemeContext)
	if (!value) {
		throw new Error('useAppTheme must be used within AppThemeProvider')
	}

	return value
}

export const useThemeColors = () => useAppTheme().colors

export const useThemeMode = () => {
	const { themeMode, resolvedTheme, setThemeMode } = useAppTheme()
	return { themeMode, resolvedTheme, setThemeMode }
}

