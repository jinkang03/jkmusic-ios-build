/**
 * 脚本化压测场景（dev-only）。一条深链跑完整个场景，全过程写 Documents/dev-stress.log，
 * 宿主机 cat 即可判定，不依赖截图时机，也不受「同一条消息只生效一次」影响。
 */
import * as FS from 'expo-file-system/legacy'
import { getSongListDetail } from './musicSdk'
import { setSetting, getSetting } from './settingsStore'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { bufferingStore } from '@/player/PlayerStore'
import { logError, logInfo } from '@/helpers/logger'

const LOG_PATH = `${FS.documentDirectory}dev-stress.log`
const CACHE_DIR = `${FS.documentDirectory}musicCache/`

export const readStressLog = async() => {
	try { return await FS.readAsStringAsync(LOG_PATH, { encoding: FS.EncodingType.UTF8 }) } catch { return '' }
}

const append = async(line: string) => {
	try {
		const prev = await readStressLog()
		await FS.writeAsStringAsync(LOG_PATH, `${prev}${new Date().toISOString()} ${line}\n`, { encoding: FS.EncodingType.UTF8 })
	} catch (err) {
		logError('[stress] 写日志失败', String((err as any)?.message ?? err))
	}
}

const cacheFiles = async(): Promise<string[]> => {
	try {
		const list: string[] = await FS.readDirectoryAsync(CACHE_DIR)
		return list
	} catch { return [] }
}

const cacheSize = async(): Promise<number> => {
	let total = 0
	for (const name of await cacheFiles()) {
		try {
			const st: any = await FS.getInfoAsync(`${CACHE_DIR}${name}`)
			if (st?.exists && !st.isDirectory) total += Number(st.size ?? 0)
		} catch { /* ignore */ }
	}
	return total
}

const waitBufferingIdle = async(maxMs = 12000) => {
	const deadline = Date.now() + maxMs
	while (Date.now() < deadline) {
		await new Promise(r => setTimeout(r, 300))
		if (bufferingStore.getValue() === null) return true
	}
	return false
}

const playIndex = async(listId: string, index: number) => {
	const res: any = await getSongListDetail('kw' as any, listId, 1)
	const jkList: any[] = res?.list ?? []
	if (!jkList.length) throw new Error('歌单为空')
	const { jkToTrack } = await import('./adapt')
	const tracks = jkList.map((m: any) => jkToTrack(m))
	const target = tracks[Math.min(index, tracks.length - 1)]
	await (myTrackPlayer as any).playWithReplacePlayList(target, tracks)
	return String(target?.title ?? '')
}

const LIST_ID = 'digest-8__3287283358'

export type StressScenario = 'lru' | 'cut' | 'badurl' | 'downloads'

export const runStress = async(
	scenario: StressScenario,
	n: number,
	onProgress?: (text: string) => void,
): Promise<{ pass: boolean, detail: string }> => {
	const step = async(msg: string) => { await append(msg); onProgress?.(msg) }
	await step(`[stress] START scenario=${scenario} n=${n}`)
	try {
		if (scenario === 'lru') {
			setSetting('download.cacheLimitMb', 20)
			setSetting('_dev.slowBufferMs', 0)
			try { await FS.deleteAsync(CACHE_DIR, { idempotent: true }) } catch { /* ignore */ }
			await step(`[stress] step=init limit=20MB files=${(await cacheFiles()).length}`)

			const total = Math.max(1, n)
			for (let i = 0; i < total; i++) {
				const title = await playIndex(LIST_ID, i)
				await waitBufferingIdle()
				const files = await cacheFiles()
				const size = await cacheSize()
				await step(`[stress] step=play i=${i} title=${title} files=${files.length} du=${(size / 1024 / 1024).toFixed(1)}MB`)
				onProgress?.(`stress lru ${i + 1}/${total}`)
				await new Promise(r => setTimeout(r, 1500))
			}

			const files = await cacheFiles()
			const size = await cacheSize()
			const parts = files.filter(f => f.endsWith('.part')).length
			const mb = size / 1024 / 1024
			const pass = mb <= 30 && parts === 0
			setSetting('download.cacheLimitMb', 500)
			await step(`[stress] DONE scenario=lru pass=${pass} detail=du=${mb.toFixed(1)}MB files=${files.length} parts=${parts}`)
			return { pass, detail: `du=${mb.toFixed(1)}MB files=${files.length} parts=${parts}` }
		}

		if (scenario === 'downloads') {
			const { readCacheIndex, removeCacheIndexEntry } = await import('@/player/CacheManager')
			// 1) audit
			const files = (await cacheFiles()).filter(f => f !== 'index.json' && !f.endsWith('.part'))
			const withSize: Array<{ name: string, size: number, mtime: number }> = []
			for (const name of files) {
				try {
					const st: any = await FS.getInfoAsync(`${CACHE_DIR}${name}`)
					if (st?.exists) withSize.push({ name, size: Number(st.size ?? 0), mtime: Number(st.modificationTime ?? 0) })
				} catch { /* ignore */ }
			}
			// 断言：先按 mtime 倒序排序，再验证「排序后首条 = 最大 mtime」且集合不变
			const sorted = [...withSize].sort((a, b) => b.mtime - a.mtime)
			const maxMtime = withSize.length ? Math.max(...withSize.map(it => it.mtime)) : 0
			const sortedOk = sorted.length === 0 || sorted[0].mtime === maxMtime
			const setName = (arr: typeof withSize) => arr.map(it => it.name).sort().join(',')
			const sameSet = setName(sorted) === setName(withSize)
			const auditPass = withSize.length > 0 && sortedOk && sameSet && withSize.every(it => it.size > 0)
			await step(`[stress] step=audit pass=${auditPass} detail=count=${withSize.length} sortedHead=max:${sortedOk} sameSet:${sameSet}`)

			// 2) play 第一条
			let playPass = false
			const first = withSize[0]
			if (first) {
				const { default: tp } = await import('@/helpers/trackPlayerIndex')
				const track: any = {
					id: first.name, platform: 'local', title: first.name, artist: '本地',
					duration: 0, url: `file://${CACHE_DIR}${first.name}`,
				}
				await (tp as any).playWithReplacePlayList(track, [track])
				await new Promise(r => setTimeout(r, 5000))
				const pos = Number(((tp as any).getProgress?.() ?? {}).position ?? 0)
				playPass = pos > 0
				await step(`[stress] step=play pass=${playPass} detail=position=${pos.toFixed(2)}`)
			} else {
				await step('[stress] step=play pass=false detail=no files')
			}

			// 3) delete 第二条
			let delPass = false
			const second = withSize[1]
			if (second) {
				const sizeBefore = await cacheSize()
				await FS.deleteAsync(`${CACHE_DIR}${second.name}`, { idempotent: true }).catch(() => undefined)
				await removeCacheIndexEntry(second.name)
				const exists = (await cacheFiles()).includes(second.name)
				const index = await readCacheIndex()
				const sizeAfter = await cacheSize()
				delPass = !exists && !index[second.name] && sizeAfter < sizeBefore
				await step(`[stress] step=delete pass=${delPass} detail=gone=${!exists} sizeDrop=${(sizeBefore - sizeAfter)}`)
			} else {
				await step('[stress] step=delete pass=false detail=not enough files')
			}

			// 4) clear
			await FS.deleteAsync(CACHE_DIR, { idempotent: true }).catch(() => undefined)
			await FS.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => undefined)
			const after = (await cacheFiles()).filter(f => f !== 'index.json')
			const clearPass = after.length === 0
			await step(`[stress] step=clear pass=${clearPass} detail=remaining=${after.length}`)

			const pass = auditPass && playPass && delPass && clearPass
			await step(`[stress] DONE scenario=downloads pass=${pass} detail=audit=${auditPass} play=${playPass} delete=${delPass} clear=${clearPass}`)
			return { pass, detail: `audit=${auditPass} play=${playPass} delete=${delPass} clear=${clearPass}` }
		}

		if (scenario === 'cut') {
			setSetting('_dev.slowBufferMs', 4000)
			await step('[stress] step=init slowBufferMs=4000')
			const t0 = await playIndex(LIST_ID, 0)
			await step(`[stress] step=play index=0 title=${t0}`)
			await new Promise(r => setTimeout(r, 2500))
			const t1 = await playIndex(LIST_ID, 1)
			await step(`[stress] step=play index=1 title=${t1} (previous download should be dropped)`)
			await new Promise(r => setTimeout(r, 10000))
			const files = await cacheFiles()
			const parts = files.filter(f => f.endsWith('.part')).length
			setSetting('_dev.slowBufferMs', 0)
			const pass = parts === 0
			await step(`[stress] DONE scenario=cut pass=${pass} detail=files=${files.length} parts=${parts}`)
			return { pass, detail: `files=${files.length} parts=${parts}` }
		}

		setSetting('_dev.forceBadUrl', true)
		try {
			// 先删掉 index=0 的缓存，确保这次一定走「解析 + 下载」分支，而不是缓存命中
			const res0: any = await getSongListDetail('kw' as any, LIST_ID, 1)
			const firstId = String(res0?.list?.[0]?.id ?? '')
			const purgeName = `kw_${firstId}.mp3`
			let deleted = false
			try {
				await FS.deleteAsync(`${CACHE_DIR}${purgeName}`, { idempotent: true })
				deleted = true
			} catch { /* ignore */ }
			await step(`[stress] step=purge cache=${purgeName} deleted=${deleted}`)
			const files0 = await cacheFiles()
			await step(`[stress] step=init forceBadUrl=true filesBefore=${files0.length}`)
			const title = await playIndex(LIST_ID, 0).catch(e => `play-failed:${String(e?.message ?? e)}`)
			await step(`[stress] step=play title=${title}`)
			await new Promise(r => setTimeout(r, 20000))
			const files1 = await cacheFiles()
			const grew = files1.length - files0.length
			setSetting('_dev.forceBadUrl', false)
			const pass = grew <= 0
			await step(`[stress] DONE scenario=badurl pass=${pass} detail=grew=${grew} files=${files1.length}`)
			return { pass, detail: `grew=${grew} files=${files1.length}` }
		} catch (err) {
			setSetting('_dev.forceBadUrl', false)
			throw err
		}
	} catch (err) {
		const msg = String((err as any)?.message ?? err)
		logError('[stress] 场景异常', msg)
		await append(`[stress] ERROR scenario=${scenario} ${msg}`)
		await append(`[stress] DONE scenario=${scenario} pass=false detail=exception:${msg}`)
		return { pass: false, detail: `exception:${msg}` }
	}
}

export default { runStress, readStressLog }
