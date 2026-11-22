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
	glassAlpha?: number
}

// 主题色变化要触发所有用 macPalette 的页面重渲染
import { macThemeStore, accentStore, wallpaperStore, textColorStore, getTextColor } from '@/jk/themeStore'
import { glassAlphaStore } from '@/constants/glass'
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
	// 玻璃透明度（设置里可调）：放进 context 依赖，保证全局即时生效
	const glassAlpha = glassAlphaStore.useValue()
	const resolvedTheme = resolveTheme(themeMode, systemColorScheme)
	const themeValue = useMemo(
		() => ({ ...createThemeValue(themeMode, resolvedTheme, setThemeMode), macTheme, accent, wallpaper, glassAlpha }),
		[resolvedTheme, themeMode, macTheme, accent, wallpaper, glassAlpha],
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
		() => ({
			...createThemeValue(parentTheme.themeMode, resolvedTheme, parentTheme.setThemeMode),
			// 保留父级的壁纸/强调色/玻璃参数：否则 override 后子页面拿不到 wallpaper，
			// 背景会退回纯色或出现 undefined（这是「切换后页面发暗」的直接原因）
			macTheme: parentTheme.macTheme,
			accent: parentTheme.accent,
			wallpaper: parentTheme.wallpaper,
			glassAlpha: parentTheme.glassAlpha,
		}),
		[parentTheme, resolvedTheme],
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

/**
 * 功能页主题：**固定浅色透感**，不跟随系统/设置的深浅色。
 *
 * 播放页（player.tsx 及播放控件）仍用 useAppTheme()，保持跟随封面/深色的原有表现。
 * 这样「搜索/歌单/排行榜/我的列表/下载/设置/各类弹窗」始终是浅色玻璃，
 * 切到深色只会影响播放页，不会让整个 App 变黑。
 */
export const usePageTheme = (): AppThemeContextValue => {
	const t = useAppTheme()
	const lightColors = useMemo(() => getThemeColors('light'), [])
	const customTextColor = textColorStore.useValue()
	// 玻璃很实（接近纯白）时白字看不见 -> 回深色字
	const solid = Number(t.glassAlpha ?? 0.55) > 0.65
	const lightInk = {
		text: '#424242',
		textMuted: '#9B9B9B',
		placeholder: '#9B9B9B',
		icon: '#424242',
		separator: 'rgba(0,0,0,0.08)',
	}
	const paperText = customTextColor
		? {
			text: customTextColor,
			textMuted: `${customTextColor}${customTextColor.length === 7 ? 'A8' : ''}`,
			placeholder: `${customTextColor}${customTextColor.length === 7 ? '8C' : ''}`,
			icon: customTextColor,
			separator: 'rgba(255,255,255,0.16)',
		}
		: {
			text: 'rgba(255,255,255,0.94)',
			textMuted: 'rgba(255,255,255,0.66)',
			placeholder: 'rgba(255,255,255,0.55)',
			icon: '#FFFFFF',
			separator: 'rgba(255,255,255,0.16)',
		}
	const hasWallpaper = !!t.wallpaper?.uri
	return useMemo(
		() => {
			if (t.isDark) {
				return {
					...t,
					resolvedTheme: 'light' as const,
					isDark: false,
					colors: { ...lightColors, ...(hasWallpaper ? paperText : {}) },
					blurTint: lightColors.blurTint,
					statusBarStyle: 'light' as const,
				}
			}
			// 浅色 + 壁纸：照片上深灰字看不清，统一白色；玻璃很实时回深色
			if (hasWallpaper) {
				return { ...t, colors: { ...t.colors, ...(solid ? lightInk : paperText) } }
			}
			return t
		},
		[t, lightColors, hasWallpaper, customTextColor, solid],
	)
}
