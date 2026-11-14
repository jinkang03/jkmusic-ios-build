/**
 * 备份与恢复：文件格式与桌面版一致。
 *   设置：  { type: 'setting_v2', data: {...} }          → lx_setting_v2.lxmc
 *   全部：  { type: 'allData_v2', setting, playList }     → lx_datas_v2.lxmc
 *   歌单：  { type: 'playList_v2', data: [...] }          → lx_list_v2.lxmc（下一批）
 * 文件内容 = gzip(JSON)，扩展名 .lxmc。
 */
import pako from 'pako'
import * as FileSystem from 'expo-file-system/legacy'
import { getAllSettings, getSettingsForExport, setSetting } from './settingsStore'
import { getDefaultList, getLoveList, getUserLists, setDefaultList, setLoveList, setUserLists, LIST_IDS } from './libraryStore'
import { logError } from '@/helpers/logger'

export type BackupType = 'setting_v2' | 'playList_v2' | 'allData_v2'
const VALID_TYPES: BackupType[] = ['setting_v2', 'playList_v2', 'allData_v2']
const BACKUP_DIR = `${FileSystem.documentDirectory}backup/`

const u8ToBase64 = (bytes: Uint8Array): string => {
	let bin = ''
	const chunk = 0x8000
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
	}
	// eslint-disable-next-line no-undef
	return globalThis.btoa ? globalThis.btoa(bin) : Buffer.from(bytes).toString('base64')
}

const base64ToU8 = (b64: string): Uint8Array => {
	// eslint-disable-next-line no-undef
	const bin = globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, 'base64').toString('binary')
	const out = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
	return out
}

const ensureDir = async() => {
	const info: any = await FileSystem.getInfoAsync(BACKUP_DIR)
	if (!info.exists) await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true })
}

export const exportSetting = async() => ({
	type: 'setting_v2' as BackupType,
	data: getSettingsForExport(),
})

export const exportPlayList = async() => {
	const lists = [
		{ id: 'default', name: '试听列表', songs: getDefaultList() },
		{ id: 'love', name: '我的收藏', songs: getLoveList() },
		...getUserLists().map(item => ({ id: item.id, name: item.name, songs: item.list })),
	]
	return { type: 'playList_v2' as BackupType, data: lists }
}

export const exportAllData = async() => {
	const setting = getSettingsForExport()
	const playList = (await exportPlayList()).data
	return { type: 'allData_v2' as BackupType, setting, playList }
}

/** 写文件：gzip(JSON) → Documents/backup/<name>.lxmc，返回绝对路径 */
export const writeBackupFile = async(name: string, obj: any): Promise<string> => {
	await ensureDir()
	const json = JSON.stringify(obj)
	const gz = pako.gzip(json)
	const uri = `${BACKUP_DIR}${name}.lxmc`
	await FileSystem.writeAsStringAsync(uri, u8ToBase64(gz), { encoding: FileSystem.EncodingType.Base64 })
	return uri
}

/** 读文件：.json 当纯文本，其它 gunzip；兼容「parse 出来还是字符串」再 parse 一次 */
export const readBackupFile = async(uri: string): Promise<any> => {
	const isJson = uri.toLowerCase().endsWith('.json')
	const content = await FileSystem.readAsStringAsync(uri, isJson
		? { encoding: FileSystem.EncodingType.UTF8 }
		: { encoding: FileSystem.EncodingType.Base64 })
	const text = isJson ? content : pako.ungzip(base64ToU8(content), { to: 'string' })
	let obj: any
	try {
		obj = JSON.parse(text)
	} catch (err) {
		throw new Error(`文件不是合法 JSON：${String((err as any)?.message ?? err)}`)
	}
	// 桌面版历史兼容：JSON.parse 出来是字符串时再 parse 一次
	if (typeof obj === 'string') {
		try { obj = JSON.parse(obj) } catch { /* 保持原样 */ }
	}
	if (!obj || typeof obj !== 'object') throw new Error('文件内容不是对象')
	if (!VALID_TYPES.includes(obj.type)) throw new Error(`未知的备份类型：${String(obj.type)}`)
	return obj
}

const isDottedKey = (key: string) => /^[a-zA-Z][\w-]*(\.[\w-]+)+$/.test(key)

export const importSetting = (data: Record<string, any>) => {
	if (!data || typeof data !== 'object') throw new Error('设置数据缺失')
	let applied = 0
	let skipped = 0
	for (const [key, value] of Object.entries(data)) {
		if (!isDottedKey(key)) { skipped++; continue }
		// 桌面备份里的下载路径是宿主绝对路径，导入时跳过，避免覆盖本机路径
		if (key === 'download.savePath') { skipped++; continue }
		try { setSetting(key, value); applied++ } catch (err) {
			logError('[jk/backup] set failed', key, String((err as any)?.message ?? err))
			skipped++
		}
	}
	return { applied, skipped }
}

const toJkMusic = (song: any) => ({
	id: String(song?.id ?? song?.meta?.songmid ?? ''),
	name: String(song?.name ?? ''),
	singer: String(song?.singer ?? ''),
	source: song?.source ?? 'kw',
	interval: song?.interval ?? null,
	meta: { ...(song?.meta ?? {}) },
})

/** 导入歌单：按 id 去重，已存在的合并歌曲（按 id 去重），不存在的新建 */
export const importPlayList = (data: any[]) => {
	if (!Array.isArray(data)) throw new Error('歌单数据不是数组')
	if (data.length === 0) throw new Error('歌单为空')

	const love = [...getLoveList()]
	const defaultList = [...getDefaultList()]
	const userLists = getUserLists().map(item => ({ ...item, list: [...item.list] }))
	let lists = 0
	let merged = 0
	let songs = 0

	const mergeInto = (target: any[], incoming: any[]) => {
		const seen = new Set(target.map((s: any) => String(s.id)))
		let added = 0
		for (const song of incoming) {
			const jk = toJkMusic(song)
			if (!jk.id || seen.has(jk.id)) continue
			target.push(jk)
			seen.add(jk.id)
			added++
		}
		return added
	}

	for (const raw of data) {
		if (!raw || (!raw.id && !raw.name)) continue
		const incoming = Array.isArray(raw.songs) ? raw.songs : []
		const id = String(raw.id ?? '')
		if (id === LIST_IDS.LOVE) {
			songs += mergeInto(love, incoming); merged++
		} else if (id === LIST_IDS.DEFAULT) {
			songs += mergeInto(defaultList, incoming); merged++
		} else {
			const existing = userLists.find(item => item.id === id || item.name === raw.name)
			if (existing) {
				songs += mergeInto(existing.list, incoming); merged++
			} else {
				const list = incoming.map(toJkMusic).filter((x: any) => x.id)
				userLists.push({ id: id || `imported_${Date.now()}_${lists}`, name: String(raw.name ?? '导入的歌单'), list })
				songs += list.length
				lists++
			}
		}
	}

	setLoveList(love)
	setDefaultList(defaultList)
	setUserLists(userLists)
	return { lists, merged, songs }
}

export const importAllData = (obj: any) => {
	if (obj?.type !== 'allData_v2') throw new Error('不是 allData_v2 备份')
	if (!obj.setting || typeof obj.setting !== 'object') throw new Error('缺少 setting 字段')
	const setting = importSetting(obj.setting)
	let playListResult = { lists: 0, merged: 0, songs: 0 }
	if (Array.isArray(obj.playList) && obj.playList.length) {
		try { playListResult = importPlayList(obj.playList) } catch (err) {
			logError('[jk/backup] playList import failed', String((err as any)?.message ?? err))
		}
	}
	return { setting, playListResult, playListCount: Array.isArray(obj.playList) ? obj.playList.length : 0 }
}

export default { exportSetting, exportPlayList, exportAllData, writeBackupFile, readBackupFile, importSetting, importPlayList, importAllData }
