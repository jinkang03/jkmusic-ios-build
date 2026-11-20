/**
 * 桌面版主题（mac 风格）：
 * 1) 主题预设：提供一套默认强调色（JK 终包/中国墨/落霞/青瓷）
 * 2) 强调色：可单独覆盖（空 = 跟随主题预设）
 * 3) 壁纸 + 磨砂玻璃：自定义背景图、模糊度、透明度
 * 4) 明暗：跟随系统 / 浅色 / 深色（app.themeMode）
 */
import * as FileSystem from 'expo-file-system/legacy'
import PersistStatus from '@/store/PersistStatus'
import { GlobalState } from '@/utils/stateMapper'
import { tr } from '@/utils/i18n'

export type MacThemeId = 'jk' | 'ink' | 'sunset' | 'celadon'

export const MAC_THEMES: Record<MacThemeId, { name: string, nameEn: string, primary: string }> = {
	jk: { name: 'JK 终包', nameEn: 'JK Final', primary: '#E240F7' },
	ink: { name: '中国墨', nameEn: 'Ink', primary: '#4B5563' },
	sunset: { name: '落霞', nameEn: 'Sunset', primary: '#FF6B6B' },
	celadon: { name: '青瓷', nameEn: 'Celadon', primary: '#2FA39A' },
}

/** 主题名按当前语言显示 */
export const themeName = (id: MacThemeId) => {
	const theme = MAC_THEMES[id] ?? MAC_THEMES.jk
	return tr(theme.name, theme.nameEn)
}

/** 强调色预设色板 */
export const ACCENT_PRESETS = [
	'#E240F7', '#FF6B6B', '#FF9F43', '#2FA39A',
	'#4A90D9', '#7C5CFC', '#E24A8D', '#4B5563',
]

const storedTheme = (PersistStatus.get('app.macTheme' as any) as MacThemeId) || 'jk'
const initialTheme = MAC_THEMES[storedTheme] ? storedTheme : 'jk'

export const macThemeStore = new GlobalState<{ id: MacThemeId, primary: string }>({
	id: initialTheme,
	primary: MAC_THEMES[initialTheme].primary,
})

/** 用户覆盖的强调色；空字符串表示跟随主题 */
export const accentStore = new GlobalState<string>(
	(PersistStatus.get('app.accentColor' as any) as string) || '',
)

export type WallpaperState = { uri: string, blur: number, opacity: number }
const storedWallpaper = (PersistStatus.get('app.wallpaper' as any) as WallpaperState) || null
export const wallpaperStore = new GlobalState<WallpaperState>(
	storedWallpaper && typeof storedWallpaper === 'object'
		? { uri: String(storedWallpaper.uri ?? ''), blur: Number(storedWallpaper.blur ?? 12), opacity: Number(storedWallpaper.opacity ?? 70) }
		: { uri: '', blur: 12, opacity: 70 },
)

export const setMacTheme = (id: MacThemeId) => {
	const theme = MAC_THEMES[id] ?? MAC_THEMES.jk
	const resolved = MAC_THEMES[id] ? id : 'jk'
	macThemeStore.setValue({ id: resolved, primary: theme.primary })
	try { PersistStatus.set('app.macTheme' as any, resolved) } catch { /* ignore */ }
}

/** 当前生效的强调色：用户覆盖优先，否则用主题预设 */
export const getAccentColor = () => {
	const custom = accentStore.getValue()
	if (custom) return custom
	return macThemeStore.getValue()?.primary || MAC_THEMES.jk.primary
}

export const setAccentColor = (color: string) => {
	accentStore.setValue(color || '')
	try { PersistStatus.set('app.accentColor' as any, color || '') } catch { /* ignore */ }
}

/**
 * 壁纸持久化只存「文件名」：沙盒绝对路径在重装/换容器后会失效（表现为壁纸空白）。
 * 旧数据里如果是绝对路径，这里取 basename 兼容。
 */
export const getWallpaperUri = (stored: string): string => {
	if (!stored) return ''
	const fileName = stored.split('/').pop() || ''
	if (!fileName) return ''
	const base = String((FileSystem as any).documentDirectory ?? '')
	return base ? `${base}${fileName}` : fileName
}

/**
 * 把用户选择的图片保存成壁纸文件。
 *
 * 之前固定写 wallpaper.jpg：URI 不变，expo-image 走内存/磁盘缓存，
 * 换图后界面仍是旧图（看着像「提示成功但不生效」）。
 * 这里改成唯一文件名 + 复制后校验 + 清理旧文件。
 */
export const saveWallpaperFrom = async(sourceUri: string): Promise<string> => {
	if (!sourceUri) throw new Error('empty uri')
	const base = String((FileSystem as any).documentDirectory ?? '')
	if (!base) throw new Error('no documentDirectory')
	const fileName = `wallpaper-${Date.now()}.jpg`
	const dest = `${base}${fileName}`
	await (FileSystem as any).copyAsync({ from: sourceUri, to: dest })
	const info: any = await (FileSystem as any).getInfoAsync(dest)
	if (!info?.exists || Number(info.size ?? 0) <= 0) throw new Error('wallpaper copy failed')
	// 清掉上一张，避免占空间
	const prev = wallpaperStore.getValue()?.uri
	if (prev) {
		const prevName = prev.split('/').pop()
		if (prevName && prevName !== fileName) {
			try { await (FileSystem as any).deleteAsync(`${base}${prevName}`, { idempotent: true }) } catch { /* ignore */ }
		}
	}
	setWallpaper({ uri: fileName })
	return fileName
}

export const setWallpaper = (next: Partial<WallpaperState>) => {
	const merged = { ...wallpaperStore.getValue(), ...next }
	wallpaperStore.setValue(merged)
	try { PersistStatus.set('app.wallpaper' as any, merged) } catch { /* ignore */ }
}

/** 是否启用「功能页面壁纸」 */
export const isWallpaperOn = () => !!wallpaperStore.getValue()?.uri

/**
 * 玻璃卡片底色 alpha：由「玻璃不透明度」滑块反推。
 * 越大越不透明（壁纸越淡），越小越透（壁纸越明显）。
 */
export const glassAlpha = () => {
	const o = Number(wallpaperStore.getValue()?.opacity ?? 70)
	const ratio = Math.min(100, Math.max(10, Number.isFinite(o) ? o : 70)) / 100
	return Math.min(0.95, Math.max(0.08, 0.12 + 0.78 * ratio))
}

export const getMacTheme = () => macThemeStore.getValue()

export default {
	MAC_THEMES, ACCENT_PRESETS, macThemeStore, accentStore, wallpaperStore,
	setMacTheme, setAccentColor, setWallpaper, saveWallpaperFrom, getAccentColor, getMacTheme, getWallpaperUri, themeName, isWallpaperOn, glassAlpha,
}
