/**
 * 设置持久化：键名与桌面版完全一致（点分格式），值存 MMKV。
 * 桌面版有的键这里都能读写；iOS 不生效的键只是"保存但不使用"。
 */
import getOrCreateMMKV from '@/store/getOrCreateMMKV'
import { logError } from '@/helpers/logger'
import jkDefaultSetting from '@/constants/jkDefaultSetting'
import * as FileSystemLegacy from 'expo-file-system/legacy'
import { useEffect, useState } from 'react'

const STORE_ID = 'jk_settings'

let store: any = null
const getStore = () => {
	if (store) return store
	try {
		store = getOrCreateMMKV(STORE_ID)
	} catch (err) {
		logError('[jk/settings] MMKV 不可用，降级到内存', String((err as any)?.message ?? err))
		const memory = new Map<string, string>()
		store = {
			getString: (k: string) => memory.get(k),
			set: (k: string, v: string) => { memory.set(k, v) },
			delete: (k: string) => { memory.delete(k) },
		}
	}
	return store
}

const listeners = new Set<() => void>()

export const getSetting = <T = any>(key: string, defaultValue: T): T => {
	try {
		const raw = getStore().getString(key)
		if (raw == null) return defaultValue
		let value = JSON.parse(raw) as any
		// 旧版本把音量存成 0..100，桌面版是 0..1，读到 >1 就迁移一次
		// 桌面版存的是宿主绝对路径（/Users/xxx/Desktop/...），iOS 上没有任何意义，
		// 读的时候直接换成 App 内路径，避免设置页显示 Mac 路径
		if (key === 'download.savePath' && typeof value === 'string'
			&& (value.includes('/Desktop') || value.includes('/Users/'))) {
			return `${FileSystemLegacy.documentDirectory}download/music` as any
		}
		if (key === 'player.volume' && typeof value === 'number' && value > 1) {
			value = value / 100
			try { getStore().set(key, JSON.stringify(value)) } catch { /* 迁移失败不阻塞读取 */ }
		}
		return value as T
	} catch {
		return defaultValue
	}
}

/** 首次启动写入桌面版默认值（幂等，不覆盖已有值；跳过 version 键） */
export const ensureDefaults = () => {
	const defaults: Record<string, any> = jkDefaultSetting as any
	let written = 0
	for (const [key, value] of Object.entries(defaults)) {
		if (key === 'version') continue
		const raw = (() => { try { return getStore().getString(key) } catch { return null } })()
		if (raw != null) continue
		setSetting(key, value)
		written++
	}
	if (written) logError(`[jk/settings] 写入默认值 ${written} 项`)
	return written
}

export const setSetting = <T = any>(key: string, value: T) => {
	try {
		const s: any = getStore()
		s.set(key, JSON.stringify(value))
		// 维护键索引，供导出备份使用
		try {
			const rawIndex = s.getString('__keys__')
			const keys: string[] = rawIndex ? JSON.parse(rawIndex) : []
			if (!keys.includes(key)) {
				keys.push(key)
				s.set('__keys__', JSON.stringify(keys))
			}
		} catch {
			// 索引损坏不影响主流程
		}
		for (const fn of listeners) fn()
	} catch (err) {
		logError('[jk/settings] set failed', key, String((err as any)?.message ?? err))
	}
}

/** 导出用：把宿主相关路径清空，不把 Mac 路径写进备份 */
export const getSettingsForExport = (): Record<string, any> => {
	const all = getAllSettings()
	if ('download.savePath' in all) all['download.savePath'] = ''
	return all
}

export const getAllSettings = (): Record<string, any> => {
	const out: Record<string, any> = {}
	try {
		const s: any = getStore()
		// MMKV 实例不一定有 getAllKeys，用自维护的索引键兜底
		let keys: string[] = []
		if (typeof s.getAllKeys === 'function') {
			keys = s.getAllKeys().filter((k: string) => k !== '__keys__')
		} else {
			const rawIndex = s.getString('__keys__')
			keys = rawIndex ? JSON.parse(rawIndex) : []
		}
		for (const k of keys) {
			const raw = s.getString(k)
			if (raw == null) continue
			try { out[k] = JSON.parse(raw) } catch { out[k] = raw }
		}
	} catch (err) {
		logError('[jk/settings] getAll failed', String((err as any)?.message ?? err))
	}
	return out
}

export const subscribeSetting = (fn: () => void) => {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

/** 组件内使用：返回 [value, setValue] */
export const useSetting = <T = any>(key: string, defaultValue: T) => {
	const [value, setValue] = useState<T>(() => getSetting<T>(key, defaultValue))
	useEffect(() => {
		const unsubscribe = subscribeSetting(() => setValue(getSetting<T>(key, defaultValue)))
		return () => { unsubscribe() }
	}, [key])
	const update = (next: T) => {
		setSetting(key, next)
		setValue(next)
	}
	return [value, update] as const
}

/** 桌面版专有键（配置可存，但 iOS 不生效） */
export const DESKTOP_ONLY_PREFIXES = [
	'desktopLyric.',
	'tray.',
	'common.windowSizeId',
	'common.transparentWindow',
	'common.startInFullscreen',
	'common.tryAutoUpdate',
	'hotKey.',
	'sync.',
	'openAPI.',
]

export const isDesktopOnlyKey = (key: string) =>
	DESKTOP_ONLY_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix))

export default { getSetting, setSetting, useSetting, isDesktopOnlyKey, getAllSettings, getSettingsForExport, ensureDefaults }
