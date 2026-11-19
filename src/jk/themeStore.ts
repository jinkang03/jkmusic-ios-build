/**
 * 桌面版主题（mac 风格）：一套浅色/深色基底 + 可切换的品牌色。
 * iOS 端不做「深色/浅色」开关，跟随系统明暗，品牌色由主题决定。
 */
import PersistStatus from '@/store/PersistStatus'
import { GlobalState } from '@/utils/stateMapper'

export type MacThemeId = 'jk' | 'ink' | 'sunset' | 'celadon'

export const MAC_THEMES: Record<MacThemeId, { name: string, primary: string }> = {
	jk: { name: 'JK 终包', primary: '#E240F7' },
	ink: { name: '中国墨', primary: '#4B5563' },
	sunset: { name: '落霞', primary: '#FF6B6B' },
	celadon: { name: '青瓷', primary: '#2FA39A' },
}

const stored = (PersistStatus.get('app.macTheme' as any) as MacThemeId) || 'jk'
const initial = MAC_THEMES[stored] ? stored : 'jk'

export const macThemeStore = new GlobalState<{ id: MacThemeId, primary: string }>({
	id: initial,
	primary: MAC_THEMES[initial].primary,
})

export const setMacTheme = (id: MacThemeId) => {
	const theme = MAC_THEMES[id] ?? MAC_THEMES.jk
	macThemeStore.setValue({ id: theme === MAC_THEMES[id] ? id : 'jk', primary: theme.primary })
	try { PersistStatus.set('app.macTheme' as any, id) } catch { /* ignore */ }
}

export const getMacTheme = () => macThemeStore.getValue()

export default { MAC_THEMES, macThemeStore, setMacTheme, getMacTheme }
