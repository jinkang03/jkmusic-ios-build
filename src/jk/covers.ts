/**
 * 歌单封面工具：平台封面地址归一化、首曲封面兜底、自定义封面文件存取。
 *
 * 自定义封面存 `Documents/covers/list-<id>-<ts>.jpg`：
 * 用唯一文件名而不是固定名，否则 expo-image 会按 URI 命中旧缓存，
 * 表现就是「提示设置成功，但列表里还是旧图」（壁纸功能踩过同一个坑）。
 */
import * as FileSystem from 'expo-file-system/legacy'

import { logInfo } from '@/helpers/logger'

const COVER_DIR = `${String((FileSystem as any).documentDirectory ?? '')}covers/`

/**
 * 平台封面地址归一化：只接受 http(s)，非法地址返回空串。
 *
 * 不做 http→https 强转：部分 CDN（如 img1.kwcdn.kuwo.cn）的证书和域名不匹配，
 * 强制 https 会直接加载失败（实测 SSL 报 no alternative certificate subject name），
 * 而 Info.plist 已开 NSAllowsArbitraryLoads，http 可以直接加载。
 */
export const normalizeCoverUrl = (url?: string): string => {
	const s = String(url ?? '').trim()
	if (!s) return ''
	return /^https?:\/\//i.test(s) ? s : ''
}

/** 自定义封面文件名 → 可显示的 file:// 地址 */
export const getCoverUri = (file?: string): string => {
	const name = String(file ?? '').split('/').pop() || ''
	if (!name) return ''
	const base = String((FileSystem as any).documentDirectory ?? '')
	return base ? `${COVER_DIR}${name}` : name
}

const ensureCoverDir = async() => {
	const info: any = await (FileSystem as any).getInfoAsync(COVER_DIR)
	if (!info?.exists) {
		await (FileSystem as any).makeDirectoryAsync(COVER_DIR, { intermediates: true })
	}
}

/** 相册选中的图片 → 沙盒里的自定义封面，返回文件名（写进 coverFile） */
export const saveCoverFrom = async(sourceUri: string, listId: string): Promise<string> => {
	if (!sourceUri) throw new Error('empty uri')
	const base = String((FileSystem as any).documentDirectory ?? '')
	if (!base) throw new Error('no documentDirectory')
	await ensureCoverDir()
	const fileName = `list-${listId}-${Date.now()}.jpg`
	const dest = `${COVER_DIR}${fileName}`
	await (FileSystem as any).copyAsync({ from: sourceUri, to: dest })
	const info: any = await (FileSystem as any).getInfoAsync(dest)
	if (!info?.exists || Number(info.size ?? 0) <= 0) throw new Error('cover copy failed')
	logInfo('[cover] saved', fileName, 'size=', String(info.size ?? 0))
	return fileName
}

/** 删除自定义封面文件（不存在也当成功） */
export const deleteCover = async(file?: string) => {
	const name = String(file ?? '').split('/').pop() || ''
	if (!name) return
	try {
		await (FileSystem as any).deleteAsync(`${COVER_DIR}${name}`, { idempotent: true })
		logInfo('[cover] deleted', name)
	} catch {
		/* ignore */
	}
}

/**
 * 没有平台封面时的兜底：取第一首能拿到封面的歌（最多看前 3 首）。
 * 各源字段名不一致，按出现频率依次尝试。
 */
export const firstSongCover = (list?: Array<any>): string => {
	for (const music of (list ?? []).slice(0, 3)) {
		const meta = music?.meta ?? {}
		const raw = meta.picUrl ?? meta.img ?? meta.artwork ?? meta.pic ?? music?.picUrl ?? ''
		const url = normalizeCoverUrl(String(raw ?? ''))
		if (url) return url
	}
	return ''
}

/** 列表行最终展示的封面：自定义 → 平台 → 首曲（空串表示回退心形） */
export const resolveListCover = (item?: {
	coverFile?: string
	coverUrl?: string
	list?: Array<any>
}): string => {
	if (!item) return ''
	if (item.coverFile) {
		const local = getCoverUri(item.coverFile)
		if (local) return local
	}
	return normalizeCoverUrl(item.coverUrl) || firstSongCover(item.list)
}
