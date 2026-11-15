/**
 * 下载页老文件回填：早期下载只落了 mp3，没有 index.json 条目。
 * 只处理 kw_<songmid>.mp3（其它源保持文件名），3 并发、失败跳过。
 */
import * as FS from 'expo-file-system/legacy'
import { readCacheIndex, upsertCacheIndex } from '@/player/CacheManager'
import { logInfo } from '@/helpers/logger'

const CACHE_DIR = `${FS.documentDirectory}musicCache/`
const CONCURRENCY = 3

const parseArtist = (lrc: string, songName: string): string => {
	// "雪人 - 范晓萱 (Mavis Fan)" → 范晓萱
	const seg = String(lrc ?? '').split('\n')[0] ?? ''
	const idx = seg.indexOf(' - ')
	if (idx < 0) return ''
	const rest = seg.slice(idx + 3).trim()
	return rest.replace(/\(.*?\)/g, '').replace(/（.*?）/g, '').trim()
}

const fetchInfo = async(songmid: string): Promise<{ title: string, artist: string, album: string } | null> => {
	try {
		const res = await fetch(`http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songmid}`)
		const json: any = await res.json()
		const info = json?.data?.songinfo
		if (!info) return null
		const lrc = String(json?.data?.lrclist?.[0]?.lineLyric ?? '')
		return {
			title: String(info.songName ?? ''),
			artist: parseArtist(lrc, String(info.songName ?? '')),
			album: String(info.album ?? ''),
		}
	} catch {
		return null
	}
}

export const backfillCacheIndex = async(): Promise<{ total: number, filled: number, failed: number }> => {
	let total = 0, filled = 0, failed = 0
	try {
		const names: string[] = await FS.readDirectoryAsync(CACHE_DIR).catch(() => [])
		const index = await readCacheIndex()
		const pending = names
			.filter(n => n.endsWith('.mp3') && !n.endsWith('.part') && !index[n])
			.map(n => ({ name: n, songmid: (n.match(/^kw_(\d+)\.mp3$/) ?? [])[1] }))
			.filter(x => !!x.songmid)
		total = pending.length
		if (!total) { logInfo('[backfill] done total=0 filled=0 failed=0'); return { total, filled, failed } }

		for (let i = 0; i < pending.length; i += CONCURRENCY) {
			const batch = pending.slice(i, i + CONCURRENCY)
			await Promise.all(batch.map(async(item) => {
				const info = await fetchInfo(item.songmid!)
				if (!info || !info.title) { failed++; return }
				let size = 0
				try {
					const st: any = await FS.getInfoAsync(`${CACHE_DIR}${item.name}`)
					size = Number(st?.size ?? 0)
				} catch { /* ignore */ }
				await upsertCacheIndex(item.name, {
					title: info.title, artist: info.artist, album: info.album,
					size, mtime: Date.now(), songmid: item.songmid, source: 'kw',
				})
				filled++
			}))
		}
		logInfo(`[backfill] done total=${total} filled=${filled} failed=${failed}`)
	} catch (err) {
		logInfo('[backfill] failed', String((err as any)?.message ?? err))
	}
	return { total, filled, failed }
}

export default { backfillCacheIndex }
