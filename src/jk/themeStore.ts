/**
 * 主题与强调色（1.3.2 起简化）：
 * 1) 强调色：唯一颜色来源，可自定义（色盘）；空 = 跟随壁纸主色
 * 2) 壁纸 + 磨砂玻璃：功能页面背景，保存时自动提取主色作为默认强调色
 * 3) 明暗：跟随系统 / 浅色 / 深色（app.themeMode）
 * 主题预设（JK 终包/中国墨/落霞/青瓷）已下线，仅保留常量做数据兼容。
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

/** 功能页面文字颜色（空 = 跟随主题/壁纸默认） */
export const textColorStore = new GlobalState<string>(
	// 默认白色（用户要求）；清空后走「跟随玻璃透明度自动反转」
	(PersistStatus.get('app.textColor' as any) as string) || '#FFFFFF',
)

export const setTextColor = (color: string) => {
	const next = String(color ?? '')
	textColorStore.setValue(next)
	try { PersistStatus.set('app.textColor' as any, next) } catch { /* ignore */ }
}

export const getTextColor = () => textColorStore.getValue()

export type WallpaperState = { uri: string, blur: number, opacity: number }

/** 壁纸主色（保存壁纸时自动提取）；未设置壁纸或提取失败时为空 */
export const wallpaperAccentStore = new GlobalState<string>(
	(PersistStatus.get('app.wallpaperAccent' as any) as string) || '',
)

export const setWallpaperAccent = (color: string) => {
	wallpaperAccentStore.setValue(color || '')
	try { PersistStatus.set('app.wallpaperAccent' as any, color || '') } catch { /* ignore */ }
}

/** 从壁纸图片提取主色（失败返回空） */
const extractWallpaperAccent = async(uri: string): Promise<string> => {
	try {
		const { getColors } = await import('react-native-image-colors')
		const result: any = await getColors(uri, { fallback: '#000000', cache: true, key: uri })
		const swatch = result?.platform === 'ios'
			? (result.background ?? result.primary)
			: (result?.dominant ?? result?.average)
		if (typeof swatch === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(swatch)) return swatch
		return ''
	} catch {
		return ''
	}
}

/** 启动时若已有壁纸但没记录主色，补提取一次 */
export const ensureWallpaperAccent = async() => {
	const uri = getWallpaperUri(wallpaperStore.getValue()?.uri ?? '')
	if (!uri) return
	if (wallpaperAccentStore.getValue()) return
	const color = await extractWallpaperAccent(uri)
	if (color) {
		setWallpaperAccent(color)
		logAccent(color)
	}
}

const logAccent = (color: string) => {
	try { console.log('[theme] wallpaper accent =', color) } catch { /* ignore */ }
}
const storedWallpaper = (PersistStatus.get('app.wallpaper' as any) as WallpaperState) || null
export const wallpaperStore = new GlobalState<WallpaperState>(
	storedWallpaper && typeof storedWallpaper === 'object'
		? { uri: String(storedWallpaper.uri ?? ''), blur: Number(storedWallpaper.blur ?? 10), opacity: Number(storedWallpaper.opacity ?? 10) }
		: { uri: '', blur: 10, opacity: 10 },
)

export const setMacTheme = (id: MacThemeId) => {
	const theme = MAC_THEMES[id] ?? MAC_THEMES.jk
	const resolved = MAC_THEMES[id] ? id : 'jk'
	macThemeStore.setValue({ id: resolved, primary: theme.primary })
	try { PersistStatus.set('app.macTheme' as any, resolved) } catch { /* ignore */ }
}

/**
 * 当前生效的强调色：
 * 1) 用户自定义（色盘/快捷色）
 * 2) 壁纸主色（设置壁纸时自动提取）
 * 3) 默认品牌色
 */
export const getAccentColor = () => {
	const custom = accentStore.getValue()
	if (custom) return custom
	const fromWallpaper = wallpaperAccentStore.getValue()
	if (fromWallpaper) return fromWallpaper
	return MAC_THEMES.jk.primary
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
	// 默认强调色跟随壁纸主色
	const color = await extractWallpaperAccent(dest)
	setWallpaperAccent(color)
	logAccent(color)
	return fileName
}

export const setWallpaper = (next: Partial<WallpaperState>) => {
	const merged = { ...wallpaperStore.getValue(), ...next }
	wallpaperStore.setValue(merged)
	try { PersistStatus.set('app.wallpaper' as any, merged) } catch { /* ignore */ }
	// 清除壁纸时同时清掉壁纸主色（强调色回落到默认）
	if (!merged.uri) setWallpaperAccent('')
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
	setMacTheme, setAccentColor, setTextColor, getTextColor, setWallpaper, saveWallpaperFrom, getAccentColor, getMacTheme, getWallpaperUri, themeName, isWallpaperOn, glassAlpha, ensureDefaultWallpaper,
	wallpaperAccentStore, setWallpaperAccent, ensureWallpaperAccent,
}

/**
 * 首次安装的默认壁纸（assets/default-wallpaper.jpg，已压缩到 200KB）。
 * 只在「用户从未设置过壁纸」时执行一次，之后一切以设置为准。
 */
export async function ensureDefaultWallpaper() {
	try {
		if (PersistStatus.get('app.defaultWallpaperSeeded' as any) === true) return
		const cur = wallpaperStore.getValue()
		if (cur?.uri) {
			PersistStatus.set('app.defaultWallpaperSeeded' as any, true)
			return
		}
		const { Asset } = await import('expo-asset')
		const FS = await import('expo-file-system/legacy')
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const mod = require('../../assets/default-wallpaper.jpg')
		const asset = Asset.fromModule(mod)
		await asset.downloadAsync()
		const src = asset.localUri ?? asset.uri
		const dest = `${FS.documentDirectory}wallpaper-default.jpg`
		await FS.copyAsync({ from: src, to: dest })
		const next = { uri: 'wallpaper-default.jpg', blur: 10, opacity: 10 }
		wallpaperStore.setValue(next)
		PersistStatus.set('app.wallpaper' as any, next)
		PersistStatus.set('app.defaultWallpaperSeeded' as any, true)
	} catch { /* 壁纸种子失败不阻塞启动 */ }
}
