import { getAccentColor, getTextColor, isWallpaperOn, glassAlpha } from '@/jk/themeStore'

/**
 * 桌面版视觉令牌（唯一事实来源：docs/mac-ui-spec.md + references/mac-ui/screenshots/）。
 * 规则：新代码只引用这里，不直接写死颜色/圆角/字号。
 */

export const macColors = {
	primary: '#E240F7',
	bg: '#FFFFFF',
	// 功能页固定「壁纸 + 透明玻璃 + 白字」：浅色主题的文字统一为白
	text: 'rgba(255,255,255,0.94)',
	textStrong: '#FFFFFF',
	textMuted: 'rgba(255,255,255,0.66)',
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
	const themed = getAccentColor()
	const palette = themed ? { ...base, primary: themed } : base
	// 用户自定义文字颜色（设置 → 基本设置 → 文字颜色）：对所有功能页生效
	const customText = getTextColor()
	const withText = customText
		? {
			...palette,
			text: customText,
			textStrong: customText,
			textMuted: `${customText}${customText.length === 7 ? 'A8' : ''}`,
		}
		: palette
	// 壁纸开启：页面底色改成半透明玻璃（mac 的 --glass-tint / --glass-tint-dark 思路），
	// 让下层的壁纸透出来。没开壁纸时完全保持原来的实色。
	if (isWallpaperOn()) {
		const a = glassAlpha()
		// 壁纸 + 高透明玻璃时，浅色主题的深灰文字在照片上几乎看不清，
		// 统一改成亮白色系（只在壁纸开启时生效；没开壁纸仍是原来的深色字）
		const paperText = isDark ? {} : {
			text: 'rgba(255,255,255,0.94)',
			textStrong: '#FFFFFF',
			textMuted: 'rgba(255,255,255,0.66)',
			divider: 'rgba(255,255,255,0.16)',
			fillSubtle: 'rgba(255,255,255,0.10)',
			fillMuted: 'rgba(255,255,255,0.18)',
		}
		return {
			...withText,
			...paperText,
			// 自定义文字色优先级最高：覆盖上面按壁纸推导的白字
			...(customText ? { text: customText, textStrong: customText } : {}),
			bg: isDark ? `rgba(18,18,20,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`,
		}
	}
	return withText
}

export default { colors: macColors, darkColors: macDarkColors, radius: macRadius, font: macFont, space: macSpace, palette: macPalette }
