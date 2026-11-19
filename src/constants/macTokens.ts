import { macThemeStore } from '@/jk/themeStore'

/**
 * 桌面版视觉令牌（唯一事实来源：docs/mac-ui-spec.md + references/mac-ui/screenshots/）。
 * 规则：新代码只引用这里，不直接写死颜色/圆角/字号。
 */

export const macColors = {
	primary: '#E240F7',
	bg: '#FFFFFF',
	text: '#424242',
	textStrong: '#1F1F1F',
	textMuted: '#9B9B9B',
	fillSubtle: '#F6F6F6',
	fillMuted: '#EFEFEF',
	divider: '#EEEEEE',
	danger: '#E5484D',
	success: '#30A46C',
}

export const macDarkColors = {
	primary: '#E240F7',
	bg: '#000000',
	text: '#F5F5F5',
	textStrong: '#FFFFFF',
	textMuted: '#8C8C8C',
	fillSubtle: '#141414',
	fillMuted: '#1C1C1C',
	divider: '#1F1F1F',
	danger: '#FF6369',
	success: '#3DD68C',
}

export const macRadius = {
	pill: 999,
	card: 12,
	player: 14,
	thumb: 8,
}

export const macFont = {
	display: 30,
	pageTitle: 15,
	cardTitle: 15,
	body: 13,
	caption: 12,
	badge: 10,
}

export const macSpace = {
	pageX: 24,
	section: 20,
	inline: 10,
	rowHeight: 56,
}

export type MacPalette = typeof macColors

/** 根据当前主题返回对应调色板 */
/**
 * 调色板：基底跟系统明暗，品牌色由主题决定（mac 风格，不做明暗开关）。
 * 读取 themeStore 的同步值；页面通过 useAppTheme() 订阅主题变化后重渲染。
 */
export const macPalette = (isDark: boolean): MacPalette => {
	const base = isDark ? macDarkColors : macColors
	const themed = macThemeStore.getValue()?.primary
	return themed ? { ...base, primary: themed } : base
}

export default { colors: macColors, darkColors: macDarkColors, radius: macRadius, font: macFont, space: macSpace, palette: macPalette }
