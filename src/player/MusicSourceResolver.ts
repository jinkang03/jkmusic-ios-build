import { fakeAudioMp3Uri } from '@/constants/images'
import { resolveLocalFile } from '@/helpers/localFile'
import { logError, logInfo } from '@/helpers/logger'
import PersistStatus from '@/store/PersistStatus'
import { showToast } from '@/utils/utils'
import { isCached, getLocalFilePath } from './CacheManager'
import { musicApiSelectedStore, nowApiState, qualityStore } from './PlayerStore'

export type SourceResult = {
	url: string
	wasCached: boolean
}

export type ResolveSourceRequestType = 'current' | 'preload'

type ResolveSourceOptions = {
	requestType?: ResolveSourceRequestType
	/** 指定请求音质（下载时可覆盖设置里的默认值），不传则用当前播放音质 */
	quality?: IMusic.IQualityKey
}

type MusicUrlRequestContext = {
	requestKey: string
	requestType: ResolveSourceRequestType
	timeoutMs: number
}

/** 音源脚本常返回 302 跳转地址，先把最终地址解析出来再交给 RNTP */
// 同一时刻只允许一个下载；新请求递增世代号，旧下载的结果会被丢弃并清理 .part
let downloadGeneration = 0

const followRedirect = async(url: string): Promise<string> => {
	if (!/^https?:\/\//i.test(url)) return url
	try {
		const res = await fetch(url, { method: 'HEAD' })
		const finalUrl = (res as any)?.url
		if (finalUrl && finalUrl !== url) {
			logInfo('[jk/play] 重定向解析:', url.slice(0, 80), '→', finalUrl.slice(0, 120))
			return finalUrl
		}
	} catch (err) {
		logInfo('[jk/play] 重定向解析失败，沿用原地址', String((err as any)?.message ?? err))
	}
	return url
}


const preloadCache = new Map<string, string>()
const CURRENT_SOURCE_REQUEST_TIMEOUT_MS = 5000
const PRELOAD_SOURCE_REQUEST_TIMEOUT_MS = 12000

/**
 * 跨源兜底：某个源整体取流失败（脚本后端停服、版权限制）时，
 * 用「歌名 + 歌手」去其它可用源找同一首并取流，保证点歌能出声。
 * 结果按歌曲缓存 5 分钟（URL 有时效，不宜久留）。
 */
const ALT_SOURCES: Array<{ id: 'kw' | 'wy' | 'tx', label: string }> = [
	{ id: 'kw', label: '酷我' },
	{ id: 'wy', label: '网易云' },
	{ id: 'tx', label: 'QQ音乐' },
]
const ALT_CACHE_TTL_MS = 5 * 60 * 1000
const altCache = new Map<string, { url: string, source: string, label: string, title: string, at: number }>()

const readFromSource = (m: any) => String(
	m?.platform ?? m?.source ?? m?.lxMusic?.source ?? '',
)

const normalizeMatchKey = (value: any) =>
	String(value ?? '').toLowerCase().replace(/[\s\-_·・,，.。()（）]/g, '')

export const clearAltCache = () => { altCache.clear() }
export const clearPreloadCache = () => { preloadCache.clear() }

const findPlayableAlt = async (
	musicItem: IMusic.IMusicItem,
	quality: string,
	requestType: ResolveSourceRequestType,
) => {
	const title = String(musicItem?.title ?? '')
	const artist = String(musicItem?.artist ?? '')
	if (!title) return null
	const cacheKey = `${musicItem?.platform}:${normalizeMatchKey(title)}:${normalizeMatchKey(artist)}:${quality}`
	const cached = altCache.get(cacheKey)
	if (cached && Date.now() - cached.at < ALT_CACHE_TTL_MS) {
		logInfo('[resolve] cross-source cached', cached.source, cached.title)
		return cached
	}

	const api: any = musicApiSelectedStore.getValue()
	if (!api?.getMusicUrl) return null
	const { searchBySource } = await import('@/jk/musicSdk')
	const { jkToTrack } = await import('@/jk/adapt')

	// 先查同曲多源索引：命中就直接取流，省掉实时搜索的 3-10 秒
	try {
		const idx = await import('@/jk/crossSourceIndex')
		const hits = idx.lookup(title, artist).filter(e => e.source !== musicItem?.platform)
		if (hits.length) {
			const tries = hits.map(e => (async() => {
				const url = await Promise.race([
					api.getMusicUrl(title, artist, e.id, quality, { requestType }, e.source, { title, artist, id: e.id, platform: e.source }),
					createTimeoutPromise(6000),
				]) as string
				if (typeof url !== 'string' || !/^https?:/.test(url)) throw new Error(`${e.source} 无地址`)
				logInfo('[resolve] cross-source index-hit', e.source, title)
				return { url, source: e.source as any, id: String(e.id ?? ''), label: String(e.source), title, at: Date.now() }
			})().catch(() => { throw new Error('miss') }))
			try {
				const found = await Promise.any(tries)
				altCache.set(cacheKey, found)
				const fromSrc = readFromSource(musicItem)
				logInfo('[resolve] switched', fromSrc, '->', found.source, title)
				return found
			} catch { /* 索引全部失败，走实时搜索 */ }
		} else {
			logInfo('[resolve] cross-source index miss', title)
		}
	} catch { /* ignore */ }

	const targetTitle = normalizeMatchKey(title)
	const targetArtist = normalizeMatchKey(artist)

	// 并行找源：三个候选源同时搜索+取流，哪个先给出可用地址就用哪个。
	// 串行时「kw 搜索超时 6s」会直接拖慢整个兜底，用户点歌要等 30s。
	const attempts = ALT_SOURCES
		.filter(alt => alt.id !== musicItem?.platform)
		.map(alt => (async() => {
			const list = await Promise.race([
				searchBySource(alt.id, `${title} ${artist}`.trim(), 1, 5),
				createTimeoutPromise(6000),
			]) as any[]
			const hit = (list || []).find((item: any) => {
				const itemTitle = normalizeMatchKey(item?.name)
				const itemArtist = normalizeMatchKey(item?.singer)
				const titleOk = !!itemTitle && (itemTitle.includes(targetTitle) || targetTitle.includes(itemTitle))
				const artistOk = !targetArtist || !itemArtist || itemArtist.includes(targetArtist) || targetArtist.includes(itemArtist)
				return titleOk && artistOk
			})
			if (!hit) throw new Error(`${alt.id} 无匹配`)
			const track: any = jkToTrack(hit)
			const url = await Promise.race([
				api.getMusicUrl(track.title, track.artist, track.id, quality, { requestType }, alt.id, track),
				createTimeoutPromise(8000),
			]) as string
			if (typeof url !== 'string' || !/^https?:/.test(url)) throw new Error(`${alt.id} 无地址`)
			return { url, source: alt.id, id: String(track.id ?? ''), label: alt.label, title: String(hit.name ?? ''), at: Date.now() }
		})().catch((err) => {
			logInfo('[resolve] cross-source miss', alt.id, String((err as any)?.message ?? err).slice(0, 80))
			throw err
		}))

	try {
		const found = await Promise.any(attempts)
		altCache.set(cacheKey, found)
		const fromSrc2 = readFromSource(musicItem)
		logInfo('[resolve] switched', fromSrc2, '->', found.source, title)
		logInfo('[resolve] cross-source', found.source, found.title, 'from', fromSrc2)
		return found
	} catch {
		return null
	}
}

const isCurrentSourceRequest = (requestType: ResolveSourceRequestType) =>
	requestType === 'current'

const getSourceRequestTimeoutMs = (requestType: ResolveSourceRequestType) =>
	isCurrentSourceRequest(requestType)
		? CURRENT_SOURCE_REQUEST_TIMEOUT_MS
		: PRELOAD_SOURCE_REQUEST_TIMEOUT_MS

const getMusicItemSourceKey = (item: IMusic.IMusicItem) =>
	String(item.platform || item.source || 'unknown').replace(/\s+/g, '_')

const createTimeoutPromise = (timeoutMs: number) =>
	new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error('请求超时')), timeoutMs)
	})

const createSourceRequestKey = (
	item: IMusic.IMusicItem,
	requestType: ResolveSourceRequestType,
) =>
	`source_${requestType}_${getMusicItemSourceKey(item)}_${item.id}_${Date.now().toString(36)}_${Math.random()
		.toString(36)
		.slice(2, 8)}`

const getSourceRequestLogPrefix = (
	requestType: ResolveSourceRequestType,
	requestKey: string,
) => `[sourceResolver][${requestType}][requestKey=${requestKey}]`

function makePreloadKey(item: IMusic.IMusicItem): string {
	return `${getMusicItemSourceKey(item)}://${item.id}`
}

export const getPreloadedUrl = (item: IMusic.IMusicItem): string | undefined => {
	return preloadCache.get(makePreloadKey(item))
}

export const preloadSource = async (item: IMusic.IMusicItem): Promise<void> => {
	const key = makePreloadKey(item)
	if (preloadCache.has(key)) return
	try {
		const result = await resolveSource(item, { requestType: 'preload' })
		if (result.url && !result.url.includes('fake')) {
			preloadCache.set(key, result.url)
			if (preloadCache.size > 10) {
				const firstKey = preloadCache.keys().next().value
				if (firstKey) preloadCache.delete(firstKey)
			}
		}
	} catch {
		// preload failures are silent
	}
}

const setQuality = (quality: IMusic.IQualityKey) => {
	qualityStore.setValue(quality)
	PersistStatus.set('music.quality', quality)
}

export const resolveSource = async (
	musicItem: IMusic.IMusicItem,
	options: ResolveSourceOptions = {},
): Promise<SourceResult> => {
	const preloadKey = makePreloadKey(musicItem)
	const requestType = options.requestType ?? 'current'

	const localFile = await resolveLocalFile(musicItem.url)
	if (localFile.status !== 'nonlocal') {
		if (localFile.status !== 'resolved') {
			if (isCurrentSourceRequest(requestType)) {
				logError('本地文件无法访问:', musicItem.url, localFile.reason)
				showToast('错误', '本地文件不存在，请删除并重新缓存或导入。', 'error')
			}
			return { url: fakeAudioMp3Uri, wasCached: false }
		}
		preloadCache.delete(preloadKey)
		return { url: localFile.fileUri, wasCached: false }
	}

	const forceRemote = (globalThis as any).__JK_FORCE_REMOTE__ === true
	const cached = forceRemote ? false : await isCached(musicItem)
	if (cached) {
		const localPath = getLocalFilePath(musicItem)
		// 缓存记录可能指向旧容器路径（重装后 UUID 变化），或文件是半截的。
		// 播放前校验：存在且 size > 0 才用，否则视为未缓存，回退到远程音源。
		const uri = String(localPath).startsWith('file://') ? String(localPath) : `file://${localPath}`
		try {
			const FS = await import('expo-file-system/legacy')
			const info: any = await FS.getInfoAsync(uri)
			const size = Number(info?.size ?? 0)
			if (info?.exists && size > 0) {
				preloadCache.delete(preloadKey)
				logInfo('使用缓存的音频路径播放:', uri, `size=${size}`)
				logInfo('[jk/play] resolved url = file:', uri.slice(0, 160), `size=${size}`)
				// 缓存文件可能是换源下载来的：读出 actualSource，供 UI 显示「音源：A → B」
				try {
					const { readCacheIndex } = await import('./CacheManager')
					const idx: any = await readCacheIndex()
					const base = String(localPath).split('/').pop() ?? ''
					const actualSource = idx?.[base]?.actualSource
					const actualId = idx?.[base]?.actualId
					const cachedFrom = readFromSource(musicItem)
					if (actualSource && actualSource !== cachedFrom) {
						logInfo('[resolve] cached-source', cachedFrom, '->', String(actualSource), 'id=', String(actualId ?? '-'))
						if (isCurrentSourceRequest(requestType)) {
							void import('@/player/PlayerStore').then(m => m.resolvedFromStore.setValue({ from: cachedFrom, to: String(actualSource), toId: actualId ? String(actualId) : undefined, title: String(musicItem.title ?? '') })).catch(() => undefined)
						}
					} else if (isCurrentSourceRequest(requestType)) {
						// 缓存来自原源（或老条目无字段）：清掉上一首残留的换源提示
						void import('@/player/PlayerStore').then(m => m.resolvedFromStore.setValue(null)).catch(() => undefined)
					}
				} catch { /* ignore */ }
				return { url: uri, wasCached: true }
			}
			logError('[jk/play] 缓存文件不可用，回退远程', uri, `exists=${info?.exists} size=${size}`)
			await FS.deleteAsync(uri, { idempotent: true }).catch(() => undefined)
		} catch (err) {
			logError('[jk/play] 校验缓存失败，回退远程', String((err as any)?.message ?? err))
		}
	}

	// 只在本地与磁盘缓存都未命中时，才复用预加载的远端音源
	const preloaded = getPreloadedUrl(musicItem)
	if (preloaded) {
		logInfo(`[sourceResolver][${requestType}] 使用预加载的音源:`, preloaded)
		preloadCache.delete(preloadKey)
		return { url: preloaded, wasCached: false }
	}

	if (!musicItem.url || musicItem.url === 'Unknown' || musicItem.url.includes('fake')) {
		const nowMusicApi = musicApiSelectedStore.getValue()
		if (nowMusicApi == null) {
			if (isCurrentSourceRequest(requestType)) {
				showToast('错误', '获取音乐失败，请先导入音源。', 'error')
			}
			return { url: fakeAudioMp3Uri, wasCached: false }
		}

		const requestKey = createSourceRequestKey(musicItem, requestType)
		const logPrefix = getSourceRequestLogPrefix(requestType, requestKey)
		const timeoutMs = getSourceRequestTimeoutMs(requestType)

		try {
			const qualityOrder: IMusic.IQualityKey[] = ['flac', '320k', '128k']
			const requestedQuality = options.quality ?? qualityStore.getValue()
			let currentQualityIndex = qualityOrder.indexOf(requestedQuality)
			let resp_url: string | null = null

			logInfo(`${logPrefix} 开始请求音源: ${musicItem.title} - ${musicItem.artist}`)

			while (currentQualityIndex < qualityOrder.length && !resp_url) {
				const currentQuality = qualityOrder[currentQualityIndex]
				try {
					resp_url = await Promise.race([
						(nowMusicApi.getMusicUrl as any)(
							musicItem.title,
							musicItem.artist,
							musicItem.id,
							currentQuality,
							{ requestKey, requestType, timeoutMs } as MusicUrlRequestContext,
							// JKMUSIC 的自定义源按音源平台分发（kw/kg/tx/wy/mg）
							musicItem.platform,
							// 完整歌曲对象：脚本按各自的字段名取 id（kg 要 hash、mg 要 copyrightId）
							musicItem,
						),
						createTimeoutPromise(timeoutMs),
					])
					if (!resp_url || resp_url === '') {
						if (isCurrentSourceRequest(requestType)) {
							logInfo(
								`${logPrefix} ${currentQuality}音质无可用链接，尝试下一个音质`,
							)
						}
						currentQualityIndex++
						resp_url = null
						continue
					}
					if (
						isCurrentSourceRequest(requestType) &&
						currentQuality !== qualityStore.getValue()
					) {
						showToast('提示', `已自动切换至${currentQuality}音质`, 'info')
						setQuality(currentQuality)
					}
					logInfo(`${logPrefix} 成功获取${currentQuality}音质的音乐URL:`, resp_url)
				} catch (error) {
					if (isCurrentSourceRequest(requestType)) {
						logInfo(`${logPrefix} ${currentQuality}音质无可用链接(catch),尝试下一个音质`)
					}
					const errMsg = error instanceof Error ? error.message : String(error)
					if (isCurrentSourceRequest(requestType)) logError('[play] getMusicUrl threw', errMsg)
					if (isCurrentSourceRequest(requestType)) {
						logError(`${logPrefix} (catch error): ${errMsg}`)
					}
					// 整源级别失败（脚本池里所有脚本都没拿到地址）时，降音质重试没有意义：
					// 直接结束音质循环，交给下面的跨源兜底，避免 3 个音质 × N 个脚本 长时间空转。
					const sourceLevelFailure = /所有脚本|没有可用脚本|所有音源|所有接口均失败/.test(errMsg)
					currentQualityIndex = sourceLevelFailure
						? qualityOrder.length
						: currentQualityIndex + 1
				}
			}

			let switchedAlt: { source: string, id: string } | null = null
			if (!resp_url) {
				// 主源整条链路失败：换其它源播同一首（跨源兜底），避免点了没声音
				const alt = await findPlayableAlt(musicItem, String(qualityStore.getValue() ?? '128k'), requestType)
				if (alt?.url) {
					resp_url = alt.url
					switchedAlt = { source: String(alt.source), id: String((alt as any).id ?? '') }
					if (isCurrentSourceRequest(requestType)) {
						showToast('提示', `该源暂不可用，已用${alt.label}播放`, 'info')
						nowApiState.setValue('正常')
					}
					logInfo(`${logPrefix} 跨源兜底成功:`, alt.source, alt.title)
				}
			}
			// 换源 → 写来源提示；主源直接成功 → 清掉上一首的提示，避免串台
			if (isCurrentSourceRequest(requestType)) {
				void import('@/player/PlayerStore')
					.then(m => m.resolvedFromStore.setValue(
						switchedAlt
							? {
								from: String(musicItem.platform ?? ''),
								to: switchedAlt.source,
								toId: switchedAlt.id,
								title: String(musicItem.title ?? ''),
							}
							: null,
					))
					.catch(() => undefined)
			}

			if (!resp_url) {
				if (isCurrentSourceRequest(requestType)) {
					nowApiState.setValue('异常')
					throw new Error('无法获取任何音质的音乐，请稍后重试。')
				}
				return { url: fakeAudioMp3Uri, wasCached: false }
			}
			const { getSetting: getDevSetting } = await import('@/jk/settingsStore')
			const badUrl = getDevSetting('_dev.forceBadUrl', false) ? 'https://127.0.0.1:9/x.mp3' : ''
			if (badUrl) {
				logInfo('[jk/play] 坏 URL 实验生效:', badUrl)
				resp_url = badUrl
			}
			logInfo(`${logPrefix} 最终的音乐 URL:`, resp_url)

			// 音质「请求值 vs 实际值」诊断：从 url 的 bitrate$ 参数或脚本返回的 type 推断
			const requested = String(qualityStore.getValue() ?? '')
			const bm = /bitrate\$(\d+)/.exec(String(resp_url))
			const actual = bm ? `${bm[1]}k` : (typeof resp_url === 'object' ? String((resp_url as any)?.type ?? 'unknown') : 'unknown')
			logInfo('[quality] requested=', requested, 'actual=', actual, 'url=', String(resp_url).slice(0, 90))
			;(globalThis as any).__jkActualQuality = actual
			const RANK: Record<string, number> = { '128k': 1, '320k': 2, flac: 3 }
			if (RANK[actual] && RANK[requested] && RANK[actual] < RANK[requested]) {
				if (isCurrentSourceRequest(requestType)) {
					showToast('提示', `该音源仅提供 ${actual}，已按此播放`, 'info')
				}
			}

			const { getSetting: getStreamSetting } = await import('@/jk/settingsStore')
			const streamMode = Boolean(getStreamSetting<boolean>('_dev.streamMode', false))
			if (streamMode) {
				logInfo('[jk/play] streamMode 生效，跳过下载直接返回远程 url')
				if (isCurrentSourceRequest(requestType)) nowApiState.setValue('正常')
				return { url: resp_url as string, wasCached: false }
			}
			// 先下载后播放：AVPlayer 在该环境下无法流式加载（本地文件正常），
			// 所以取到远程地址后先落到本地，再交给播放器 file:// 路径。
			const myGeneration = ++downloadGeneration
			let bufferingTimer: any = null
			try {
				const { downloadToCache, enforceCacheLimit } = await import('@/player/CacheManager')
				const { bufferingStore } = await import('@/player/PlayerStore')
				const { getSetting } = await import('@/jk/settingsStore')
				logInfo('[jk/play] 开始缓冲下载:', musicItem.title)
				// 缓冲态延迟 200ms 才显示：本地下载通常几十毫秒，不该闪一下
				let bufferingShown = false
				bufferingTimer = setTimeout(() => {
					bufferingShown = true
					bufferingStore.setValue({ title: String(musicItem.title ?? ''), percent: 0 })
				}, 200)
				const recordProgress = (percent: number) => {
						if (bufferingShown) bufferingStore.setValue({ title: String(musicItem.title ?? ''), percent })
					}
				const slowMs = Number(getSetting('_dev.slowBufferMs', 0)) || 0
				if (slowMs > 0) {
					bufferingShown = true
					bufferingStore.setValue({ title: String(musicItem.title ?? ''), percent: 0 })
				}
				// 换源下载时记录实际提供方（缓存命中时据此显示「音源：A → B」）；
				// switchedAlt 是本函数内的局部真值，比全局 __jkActualSource 可靠
				const actualSource = String(switchedAlt?.source ?? (globalThis as any).__jkActualSource ?? musicItem.platform ?? '')
				const actualId = String(switchedAlt?.id ?? musicItem.id ?? '')
				const localPath = await downloadToCache(
					{ ...(musicItem as any), url: resp_url } as any,
					recordProgress,
					{ actualSource, actualId } as any,
				)
				if (slowMs > 0) {
					// dev 专用：人为拉长缓冲窗口，便于截图与边界验收
					await new Promise(r => setTimeout(r, slowMs))
				}
				clearTimeout(bufferingTimer)
				bufferingStore.setValue(null)
				// 下载完顺手做一次 LRU（上限读设置 download.cacheLimitMb，正在播的文件不删）
				const limitMb = Number(getSetting('download.cacheLimitMb', 500)) || 500
				logInfo('[cache] LRU 上限', `${limitMb}MB`)
				void enforceCacheLimit(limitMb * 1024 * 1024, localPath).catch(() => undefined)
				if (myGeneration !== downloadGeneration) {
					logInfo('[jk/play] 下载世代已过期，丢弃结果')
				} else {
					const uri = String(localPath).startsWith('file://') ? String(localPath) : `file://${localPath}`
					logInfo('[jk/play] 缓冲完成，改播本地:', uri.slice(0, 120))
					// 起播后 2 秒后台预取下一首，切歌时命中缓存走 file://
					setTimeout(() => {
						void import('@/player/prefetch').then(m => m.prefetchNext()).catch(() => undefined)
					}, 2000)
					if (isCurrentSourceRequest(requestType)) nowApiState.setValue('正常')
					return { url: uri, wasCached: true }
				}
			} catch (err) {
				if (bufferingTimer) clearTimeout(bufferingTimer)
				logError('[jk/play] 缓冲下载失败，回退远程流式', String((err as any)?.message ?? err))
				try {
					const { bufferingStore } = await import('@/player/PlayerStore')
					bufferingStore.setValue(null)
				} catch { /* ignore */ }
			}
			// 302 → 解析成最终地址；否则 AVPlayer 可能拿不到音频
			resp_url = await followRedirect(resp_url as string)
			if (isCurrentSourceRequest(requestType)) {
				nowApiState.setValue('正常')
			}
			return { url: resp_url, wasCached: false }
		} catch (error) {
			if (isCurrentSourceRequest(requestType)) {
				nowApiState.setValue('异常')
			}
			const errMsg = error instanceof Error ? error.message : String(error)
			if (isCurrentSourceRequest(requestType)) {
				logError(`${logPrefix} 获取音乐 URL 失败: ${errMsg}`)
				const errorMessage =
					errMsg === '请求超时'
						? '获取音乐超时，请稍后重试。'
						: errMsg || '获取音乐失败，请稍后重试。'
				showToast(errorMessage, '', 'error')
			}
			return { url: fakeAudioMp3Uri, wasCached: false }
		}
	}

	return { url: musicItem.url, wasCached: false }
}
