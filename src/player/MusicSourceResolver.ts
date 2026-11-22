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

export type ResolveSourceRequestType = 'current' | 'preload' | 'download'

type ResolveSourceOptions = {
	requestType?: ResolveSourceRequestType
	/** 指定请求音质（下载时可覆盖设置里的默认值），不传则用当前播放音质 */
	quality?: IMusic.IQualityKey
	/** 手动下载：只取流，不做「先下载到缓存」那一步 */
	skipDownload?: boolean
}

type MusicUrlRequestContext = {
	requestKey: string
	requestType: ResolveSourceRequestType
	timeoutMs: number
}

/** 音源脚本常返回 302 跳转地址，先把最终地址解析出来再交给 RNTP */
/**
 * 下载世代号：**按曲目隔离**。
 *
 * 之前是全局计数器，而预取会同时发起 3 个下载（`prefetch` 限流 cap=3），
 * 每个预取都会把全局世代 +1，导致正在播的那首下载到 100% 后被判「世代过期」丢弃，
 * 最终落到「本曲不可播」—— 表现为点歌后一直 00:00 卡住（实测日志：
 * `下载进度 100%` → `下载世代已过期，丢弃结果` → `判定本曲不可播`）。
 *
 * 现在只有「同一首歌」的新请求才会作废旧请求。
 */
const downloadGenerations = new Map<string, number>()
const downloadGenKey = (item: any) => `${String(item?.platform ?? '')}:${String(item?.id ?? '')}`

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


const readFromSource = (m: any) => String(
	m?.platform ?? m?.source ?? m?.lxMusic?.source ?? '',
)

const normalizeMatchKey = (value: any) =>
	String(value ?? '').toLowerCase().replace(/[\s\-_·・,，.。()（）[\]【】'"“”]/g, '')

/** 去掉标题里的括号说明与「 - 后缀」，用于跨源匹配（翻唱/伴奏版本标题经常很长） */
const stripTitleDecor = (value: any): string => {
	let text = String(value ?? '')
	text = text.replace(/\([^)]*\)/g, ' ').replace(/（[^）]*）/g, ' ')
	text = text.replace(/\[[^\]]*\]/g, ' ').replace(/【[^】]*】/g, ' ')
	text = text.replace(/\s+-\s+.*$/, ' ')
	return normalizeMatchKey(text)
}

/** 歌手字段常是「KAROL G、Bruno Mars」「A, B & C」这种多值，拆开逐段匹配 */
const splitArtists = (value: any): string[] =>
	String(value ?? '')
		.split(/[,、&/;，；]/)
		.map(part => normalizeMatchKey(part))
		.filter(part => part.length > 0)

export const clearAltCache = () => {
	altCache.clear()
	altBackups.clear()
}
export const clearPreloadCache = () => { preloadCache.clear() }

/**
 * 跨源兜底：当前平台取流失败时，把「歌名 + 歌手」拿到**所有其它平台**找同曲，
 * 每个候选曲目都用「脚本池」取流（同一平台会并发尝试所有支持它的脚本），
 * 全部尝试完仍失败才返回 null（由调用方暂停并提示）。
 */
/** 全部平台：兜底时逐个平台找同曲（顺序只影响日志，实际并发竞速） */
const ALL_PLATFORMS: Array<{ id: 'kw' | 'kg' | 'tx' | 'wy' | 'mg', label: string }> = [
	{ id: 'kw', label: '酷我' },
	{ id: 'kg', label: '酷狗' },
	{ id: 'tx', label: 'QQ音乐' },
	{ id: 'wy', label: '网易云' },
	{ id: 'mg', label: '咪咕' },
]

type AltCandidate = {
	platform: string
	id: string
	name: string
	singer: string
	meta?: Record<string, any>
	fromIndex: boolean
}

type AltFound = {
	url: string
	source: string
	id: string
	label: string
	title: string
	at: number
}

/** 加密容器后缀：AVPlayer 打不开，取流后立刻判死，不浪费一次起播 */
const ENCRYPTED_URL_RE = /\.(mgg|mflac0?|qmc[0-9a-z]*|tm[0-6])(?:$|[?#])/i
export const isEncryptedAudioUrl = (url: any) => ENCRYPTED_URL_RE.test(String(url ?? ''))

/**
 * 音质只降不升。
 * 之前 `[quality, '320k', '128k']` 在设 128k 时会去试 320k（等于偷偷升档）。
 */
const QUALITY_LADDER: Record<string, string[]> = {
	flac: ['flac', '320k', '128k'],
	'320k': ['320k', '128k'],
	'128k': ['128k'],
}
const qualitiesFor = (quality: any) => QUALITY_LADDER[String(quality ?? '')] ?? ['128k']

const platformLabel = (id: string) => ALL_PLATFORMS.find(p => p.id === id)?.label ?? id

/** 换源总预算：到点就用已有结果，绝不无限等 */
const ALT_BUDGET_MS = 12000
const ALT_PRELOAD_BUDGET_MS = 6000
const ALT_CACHE_TTL_MS = 5 * 60 * 1000
const ALT_BACKUP_MAX_KEYS = 30

/** 身份缓存：记住「哪首歌的哪个 id 能用」，地址每次重新取（脚本地址有时效） */
const altCache = new Map<string, { source: string, id: string, name: string, at: number }>()
/** 备用队列：并发阶段已经取到的地址，主链路失败时直接 pop（切换 0 延迟） */
const altBackups = new Map<string, { list: AltFound[], at: number }>()

const altKeyOf = (source: any, id: any) => `${String(source ?? '')}:${String(id ?? '')}`

/**
 * 占位地址检测。
 * 实测部分脚本对不同歌曲返回**同一条**地址（例如
 * `http://106.0.55.102/2026-11-22-150024_110711.mp3`），这条地址连得上但永不返回数据。
 * 音频地址都是带签名的独立地址，两首歌拿到同一条基本只能是占位/坏链。
 */
const usedUrlOwner = new Map<string, string>()
const rememberUrlOwner = (url: string, songKey: string) => {
	usedUrlOwner.set(url, songKey)
	if (usedUrlOwner.size > 300) {
		const first = usedUrlOwner.keys().next().value
		if (first) usedUrlOwner.delete(first)
	}
}
const isPlaceholderForOtherSong = (url: string, songKey: string) => {
	const owner = usedUrlOwner.get(url)
	return !!owner && owner !== songKey
}

const rememberBackups = (cacheKey: string, list: AltFound[]) => {
	// 存数组引用：后续并发成功的候选会继续 push 进来，换源时可以直接用
	altBackups.set(cacheKey, { list, at: Date.now() })
	if (altBackups.size > ALT_BACKUP_MAX_KEYS) {
		let oldestKey = ''
		let oldestAt = Number.MAX_SAFE_INTEGER
		for (const [k, v] of altBackups) {
			if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k }
		}
		if (oldestKey) altBackups.delete(oldestKey)
	}
}

const takeBackup = (cacheKey: string, exclude: Set<string>): AltFound | null => {
	const entry = altBackups.get(cacheKey)
	if (!entry) return null
	if (Date.now() - entry.at > ALT_CACHE_TTL_MS) {
		altBackups.delete(cacheKey)
		return null
	}
	return entry.list.find(h => !exclude.has(altKeyOf(h.source, h.id)) && !exclude.has(h.url)) ?? null
}

/**
 * 跨源兜底：当前平台取流失败时，把「歌名 + 歌手」拿到**所有其它平台**找同曲，
 * 每个候选曲目都用「脚本池」取流（同一平台会并发尝试所有支持它的脚本）。
 *
 * 与旧实现的三点区别：
 * 1. 不再等最慢的平台：索引候选立刻开跑，搜索结果谁先到谁先取流（B1）；
 * 2. 有总预算（12s），到点就用已有结果返回，不会拖到 80s（B2）；
 * 3. 成功结果会留在备用队列里，主链路播不出来时可以直接切下一个（A2）。
 *
 * @param options.exclude 已失败过的 `source:id` / 地址，避免原地重试同一首
 */
export const findPlayableAlt = async (
	musicItem: IMusic.IMusicItem,
	quality: string,
	requestType: ResolveSourceRequestType,
	options: { exclude?: Set<string> } = {},
) => {
	const title = String(musicItem?.title ?? '')
	const artist = String(musicItem?.artist ?? '')
	if (!title) return null
	const cacheKey = `${musicItem?.platform}:${normalizeMatchKey(title)}:${normalizeMatchKey(artist)}:${quality}`
	const exclude = options.exclude ?? new Set<string>()

	// 1) 备用队列：并发阶段已经取到的地址，直接复用（切换 0 延迟）
	if (requestType === 'current') {
		const backup = takeBackup(cacheKey, exclude)
		if (backup) {
			logInfo('[resolve] backup hit', backup.source, backup.label, String(backup.title ?? '').slice(0, 40))
			return backup
		}
	}

	// 2) 身份缓存：省掉实时搜索，但地址必须重新取（脚本地址常有 vkey 时效）
	const known = altCache.get(cacheKey)
	if (known && Date.now() - known.at < ALT_CACHE_TTL_MS && !exclude.has(altKeyOf(known.source, known.id))) {
		logInfo('[resolve] identity cache, refetch', known.source, known.id)
		const { getPooledMusicUrl } = await import('@/jk/sourceRegistry')
		for (const q of qualitiesFor(quality)) {
			try {
				const url = await Promise.race([
					getPooledMusicUrl(
						known.name,
						artist,
						known.id,
						q,
						known.source,
						{ songmid: known.id, id: known.id, source: known.source },
					),
					createTimeoutPromise(7000),
				]) as string
				if (typeof url === 'string' && /^https?:/.test(url) && !isEncryptedAudioUrl(url)) {
					logInfo('[resolve] identity cache ok', known.source, q)
					return {
						url,
						source: known.source,
						id: known.id,
						label: platformLabel(known.source),
						title: known.name,
						at: Date.now(),
					} as AltFound
				}
			} catch { /* 换下一档音质 */ }
		}
		altCache.delete(cacheKey)
	}

	const currentPlatform = readFromSource(musicItem)
	// 只保留「确实有脚本支持」的平台：没有脚本的平台取流必然失败，
	// 留着只会让兜底多等一个超时（例如只装 HelloWorld 时它不支持 wy）
	let supported: Set<string> | null = null
	try {
		const { hasSource } = await import('@/jk/sourceRegistry')
		supported = new Set(ALL_PLATFORMS.map(p => p.id).filter(id => hasSource(id)))
	} catch { /* 取不到就退回全平台 */ }
	const platforms = ALL_PLATFORMS.filter(p =>
		p.id !== currentPlatform && (!supported || supported.has(p.id)),
	)
	if (!platforms.length) return null

	const { getPooledMusicUrl } = await import('@/jk/sourceRegistry')
	const { searchBySource } = await import('@/jk/musicSdk')
	// 开发开关：把候选地址替换成必然失败的地址，用来验证「一个接一个换源」链路
	const { getSetting: getDevSetting } = await import('@/jk/settingsStore')
	const badFlag = getDevSetting<any>('_dev.forceBadUrl', false)
	const forceBadUrl = badFlag === true || (typeof badFlag === 'string' && /^https?:/.test(badFlag))
	const forceBadValue = typeof badFlag === 'string' && /^https?:/.test(badFlag)
		? badFlag
		: 'https://127.0.0.1:9/x.mp3'

	const targetTitleFull = normalizeMatchKey(title)
	const targetTitleMain = stripTitleDecor(title)
	const targetArtists = splitArtists(artist)

	/**
	 * 跨源匹配打分（不再要求歌手必须完全包含）：
	 * 标题：完全一致 3 分 / 主标题一致或包含 2 分 / 部分包含 1 分；
	 * 歌手：任一歌手有交集 +5 分（冷门翻唱版本歌手名不同时仍然可用）。
	 */
	const scoreOf = (item: any): number => {
		const itemFull = normalizeMatchKey(item?.name)
		const itemMain = stripTitleDecor(item?.name)
		if (!itemFull) return 0
		let titleScore = 0
		if (itemFull === targetTitleFull || (!!itemMain && itemMain === targetTitleMain)) titleScore = 3
		else if (itemMain && targetTitleMain && (itemMain.includes(targetTitleMain) || targetTitleMain.includes(itemMain))) titleScore = 2
		else if (itemFull.includes(targetTitleFull) || targetTitleFull.includes(itemFull)) titleScore = 1
		else if (targetTitleMain && itemFull.includes(targetTitleMain)) titleScore = 1
		if (!titleScore) return 0
		const itemArtists = splitArtists(item?.singer)
		const artistHit = itemArtists.some(x => targetArtists.some(y => x.includes(y) || y.includes(x)))
		// 规则：同名（去掉括号/后缀后一致）+ 同歌手 → 直接判定为同一首，
		// 不再要求其它字段吻合（用户明确：同名同歌手就算成功）
		if (artistHit && (itemFull === targetTitleFull || (!!itemMain && itemMain === targetTitleMain))) return 100
		return titleScore * 10 + (artistHit ? 5 : 0)
	}

	// 搜索词变体：完整标题 → 主标题 + 首位歌手 → 仅主标题
	// （kw 等平台对超长标题经常返回空，需要退化查询）
	const queries = Array.from(new Set([
		`${title} ${artist}`.trim(),
		`${stripTitleDecor(title) || title} ${splitArtists(artist)[0] ?? ''}`.trim(),
		stripTitleDecor(title) || title,
	].filter(Boolean)))

	const budget = requestType === 'preload' ? ALT_PRELOAD_BUDGET_MS : ALT_BUDGET_MS
	const deadline = Date.now() + budget

	// 并发引擎：候选随到随取流，第一个成功立刻返回；其余成功留在备用队列
	const found: AltFound[] = []
	let primary: AltFound | null = null
	let resolvePrimary: (v: AltFound) => void = () => undefined
	const primaryPromise = new Promise<AltFound>(resolve => { resolvePrimary = resolve })
	const attempts: Promise<void>[] = []
	const started = new Set<string>()

	const accept = (hit: AltFound) => {
		if (exclude.has(altKeyOf(hit.source, hit.id)) || exclude.has(hit.url)) return
		if (found.some(h => h.source === hit.source && h.id === hit.id)) return
		found.push(hit)
		if (!primary) {
			primary = hit
			resolvePrimary(hit)
		}
	}

	const startAttempt = (c: AltCandidate) => {
		const attemptKey = altKeyOf(c.platform, c.id)
		if (started.has(attemptKey) || exclude.has(attemptKey)) return
		started.add(attemptKey)
		attempts.push((async() => {
			for (const q of qualitiesFor(quality)) {
				if (Date.now() > deadline) return
				try {
					const url = await Promise.race([
						getPooledMusicUrl(
							c.name,
							c.singer,
							c.id,
							q,
							c.platform,
							// 不要把 hash 强行写成 id：kg 的 hash 与 id 不同，脚本会优先取 hash
							{ ...(c.meta ?? {}), songmid: c.id, id: c.id, source: c.platform },
						),
						createTimeoutPromise(7000),
					]) as string
					if (typeof url !== 'string' || !/^https?:/.test(url)) continue
					if (isEncryptedAudioUrl(url)) {
						logInfo('[resolve] matrix 加密格式跳过', c.platform, q, url.slice(0, 60))
						continue
					}
					if (isPlaceholderForOtherSong(url, `${musicItem?.platform}:${musicItem?.id}`)) {
						logInfo('[resolve] matrix 占位地址跳过', c.platform, q, url.slice(0, 60))
						continue
					}
					logInfo(`[resolve] matrix ok platform=${c.platform} quality=${q} id=${c.id} from=${c.fromIndex ? 'index' : 'search'}`)
					rememberUrlOwner(url, `${musicItem?.platform}:${musicItem?.id}`)
					if (forceBadUrl) logInfo('[resolve] 坏 URL 实验生效（换源链路）:', c.platform, c.id)
					accept({
						url: forceBadUrl ? forceBadValue : url,
						source: c.platform,
						id: c.id,
						label: platformLabel(c.platform),
						title: c.name,
						at: Date.now(),
					})
					return
				} catch { /* 换下一档音质 */ }
			}
			logInfo(`[resolve] matrix fail platform=${c.platform} id=${c.id}`)
		})())
	}

	// 索引候选立刻开跑，不等实时搜索（这是最常见的「上次搜到过」场景）
	try {
		const idx = await import('@/jk/crossSourceIndex')
		for (const e of idx.lookup(title, artist)) {
			if (!e?.id || e.source === currentPlatform) continue
			if (!platforms.some(p => p.id === e.source)) continue
			startAttempt({
				platform: String(e.source),
				id: String(e.id),
				name: String(e.name || title),
				singer: String(e.singer || artist),
				meta: { songmid: String(e.id), id: String(e.id), source: e.source },
				fromIndex: true,
			})
		}
		if (started.size) logInfo('[resolve] matrix 索引候选', started.size)
	} catch { /* ignore */ }

	const searchBest = async(p: { id: string }): Promise<AltCandidate | null> => {
		let best: any = null
		let bestScore = 0
		for (const q of queries) {
			if (Date.now() > deadline) break
			try {
				const res = await Promise.race([
					searchBySource(p.id as any, q, 1, 15),
					createTimeoutPromise(6500),
				]) as any[]
				for (const item of res ?? []) {
					const score = scoreOf(item)
					if (score > bestScore) { bestScore = score; best = item }
				}
				if (bestScore >= 100) break
			} catch { /* 换下一个查询词 */ }
		}
		if (!best) {
			logInfo(`[resolve] matrix 搜索无结果 platform=${p.id}`)
			return null
		}
		logInfo(`[resolve] matrix search hit platform=${p.id} score=${bestScore} name=${String(best.name ?? '').slice(0, 48)}`)
		return {
			platform: p.id,
			id: String(best.id),
			name: String(best.name ?? title),
			singer: String(best.singer ?? artist),
			meta: best,
			fromIndex: false,
		}
	}

	// 预取只查索引：不然每切一首歌都会额外打 5 个平台的搜索接口
	const searches = requestType === 'preload'
		? Promise.resolve()
		: Promise.allSettled(platforms.map(async(p) => {
			const c = await searchBest(p)
			if (c) startAttempt(c)
		}))

	// 所有候选跑完（或预算耗尽）才算「没有可用的」
	const drained = (async() => {
		await searches
		let index = 0
		while (index < attempts.length) {
			const batch = attempts.slice(index)
			index = attempts.length
			await Promise.allSettled(batch)
		}
		return null
	})()

	let budgetTimer: any = null
	const budgetPromise = new Promise<null>(resolve => {
		budgetTimer = setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()))
	})

	const winner = await Promise.race([primaryPromise, drained, budgetPromise]) as AltFound | null
	if (budgetTimer) clearTimeout(budgetTimer)

	// 先登记备用队列再去重：后续并发成功的候选会继续 push 进同一个数组
	if (found.length) rememberBackups(cacheKey, found)

	const chosen = winner ?? found[0] ?? null
	if (!chosen) {
		logInfo('[resolve] matrix 所有平台均失败 title=', title, String(artist ?? ''), 'platforms=', platforms.map(p => p.id).join('/'))
		return null
	}
	altCache.set(cacheKey, { source: chosen.source, id: chosen.id, name: chosen.title, at: Date.now() })
	logInfo('[resolve] switched', currentPlatform, '->', chosen.source, title)
	return chosen
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

/**
 * 缓存命中前的「片段校验」：只有 60 秒试听片段的缓存必须删掉重取，
 * 否则片段播完会被当成正常结束自动切歌（歌单连跳的根源之一）。
 */
const isTruncatedCachedFile = async(
	uri: string,
	musicItem: IMusic.IMusicItem,
	localPath: string,
): Promise<boolean> => {
	try {
		const { parseIntervalSeconds, intervalOf, readAudioDuration, isTruncatedAudio, sizeHintBytes, isTruncatedBySize } = await import('./audioDuration')
		const actual = await readAudioDuration(uri)
		const expected = parseIntervalSeconds(intervalOf(musicItem))
		const FS0 = await import('expo-file-system/legacy')
		const info0: any = await (FS0 as any).getInfoAsync(uri)
		const bytes = Number(info0?.size ?? 0)
		const hint = sizeHintBytes(musicItem as any)
		const truncated = isTruncatedAudio(actual, expected)
			|| (!actual && isTruncatedBySize(bytes, hint))
		if (!truncated) return false
		logError('[jk/play] 缓存为试听片段，删除重取:', uri.slice(0, 120),
			`actual=${actual ? actual.toFixed(0) + 's' : '?'}/${expected}s`, `size=${bytes}/${hint || '-'}`)
		const FS = await import('expo-file-system/legacy')
		await (FS as any).deleteAsync(uri, { idempotent: true }).catch(() => undefined)
		try {
			const { removeCacheIndexEntry } = await import('./CacheManager')
			await removeCacheIndexEntry(String(localPath).split('/').pop() ?? '')
		} catch { /* ignore */ }
		return true
	} catch {
		return false
	}
}

const setQuality = (quality: IMusic.IQualityKey) => {
	qualityStore.setValue(quality)
	// 与 trackPlayerIndex.setQuality 保持一致：settingsStore 是唯一真源
	import('@/jk/settingsStore').then(m => m.setSetting('music.quality', quality)).catch(() => undefined)
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
	// 手动下载必须按「请求的音质」重新取流：命中播放缓存会拿到别的音质（实测 128k 下成 flac）
	const isDownloadRequest = requestType === 'download'
	const cached = (forceRemote || isDownloadRequest) ? false : await isCached(musicItem)
	if (cached) {
		const localPath = getLocalFilePath(musicItem)
		// 缓存记录可能指向旧容器路径（重装后 UUID 变化），或文件是半截的。
		// 播放前校验：存在且 size > 0 才用，否则视为未缓存，回退到远程音源。
		const uri = String(localPath).startsWith('file://') ? String(localPath) : `file://${localPath}`
		try {
			const FS = await import('expo-file-system/legacy')
			const info: any = await FS.getInfoAsync(uri)
			const size = Number(info?.size ?? 0)
			const truncatedCache = info?.exists && size > 0
				? await isTruncatedCachedFile(uri, musicItem, localPath)
				: false
			if (info?.exists && size > 0 && !truncatedCache) {
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

	// 只在本地与磁盘缓存都未命中时，才复用预加载的远端音源。
	// 下载请求不复用（预取地址用的是当前播放音质）。
	// 注意：本环境 AVPlayer 放不了网络流，current 请求拿到预取地址也要先下载，
	// 不能直接把 http 地址交给播放器（否则必然 PlaybackError → 被判失败）。
	let preloadedUrl: string | null = null
	const preloaded = getPreloadedUrl(musicItem)
	if (preloaded && !isDownloadRequest) {
		preloadCache.delete(preloadKey)
		if (isCurrentSourceRequest(requestType)) {
			preloadedUrl = preloaded
			logInfo('[sourceResolver] 使用预取地址（将先下载再播放）:', String(preloaded).slice(0, 100))
		} else {
			logInfo(`[sourceResolver][${requestType}] 使用预加载的音源:`, preloaded)
			return { url: preloaded, wasCached: false }
		}
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
					// 占位地址（同一 URL 被别的歌用过）与加密容器都在这里判死，
					// 当作「这一档音质失败」继续下一档；全部失败再走跨源兜底。
					{
						const songKey = `${musicItem?.platform}:${musicItem?.id}`
						if (isEncryptedAudioUrl(resp_url)) {
							logInfo(`${logPrefix} ${currentQuality} 返回加密容器，换下一档:`, String(resp_url).slice(0, 70))
							resp_url = null
							currentQualityIndex++
							continue
						}
						if (isPlaceholderForOtherSong(resp_url, songKey)) {
							logInfo(`${logPrefix} ${currentQuality} 返回占位地址（别的歌用过），换下一档:`, String(resp_url).slice(0, 70))
							resp_url = null
							currentQualityIndex++
							continue
						}
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
			if (!resp_url && preloadedUrl) {
				resp_url = preloadedUrl
				logInfo('[jk/play] 预取地址可用，跳过重复取流，直接下载')
			}
			if (!resp_url) {
				// 主源整条链路失败：换其它源播同一首（跨源兜底），避免点了没声音
				const alt = await findPlayableAlt(musicItem, String(options.quality ?? qualityStore.getValue() ?? '128k'), requestType)
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
			const badFlag2 = getDevSetting<any>('_dev.forceBadUrl', false)
			const badUrl = typeof badFlag2 === 'string' && /^https?:/.test(badFlag2)
				? badFlag2
				: (badFlag2 === true ? 'https://127.0.0.1:9/x.mp3' : '')
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

			// 手动下载：直接把远程地址交给下载器（否则会先落到播放缓存，拿到的是别的音质）
			if (options.skipDownload === true) {
				logInfo('[jk/play] skipDownload：返回远程 URL 供下载')
				return { url: String(resp_url), wasCached: false }
			}
			// 流式播放：直接返回远程地址（实测 AVPlayer 能播明文 mp3/flac/m4a，
			// 起播 <1s、连续切歌/拖动均正常）。
			// 加密容器（QQ 音乐 .mgg/.mflac、.qmc*）AVPlayer 打不开，直接判失败交给换源。
			const urlStr = typeof resp_url === 'string'
				? resp_url
				: String((resp_url as any)?.url ?? '')
			if (isEncryptedAudioUrl(urlStr)) {
				logInfo('[jk/play] 加密音频格式，跳过流式直接换源:', urlStr.slice(0, 90))
				throw new Error('ENCRYPTED_AUDIO')
			}
			{
				const songKey = `${musicItem?.platform}:${musicItem?.id}`
				if (isPlaceholderForOtherSong(urlStr, songKey)) {
					logInfo('[jk/play] 该地址已被其它歌曲使用过，判定为占位/坏链，换源:', urlStr.slice(0, 90))
					throw new Error('SOURCE_UNAVAILABLE')
				}
				rememberUrlOwner(urlStr, songKey)
			}
			if (isCurrentSourceRequest(requestType)) nowApiState.setValue('正常')
			logInfo('[jk/play] 流式播放:', urlStr.slice(0, 120))
			return { url: urlStr, wasCached: false }
		} catch (error) {
			if (isCurrentSourceRequest(requestType)) {
				nowApiState.setValue('异常')
			}
			const errMsg = error instanceof Error ? error.message : String(error)
			if (isCurrentSourceRequest(requestType)) {
				logError(`${logPrefix} 获取音乐 URL 失败: ${errMsg}`)
				// 交给 play()：暂停当前曲目并提示「所有平台均不可用，点击播放重试」，
				// 不在这里回退假音频（那会让播放器停在静音文件上，用户以为"没反应"）
				throw new Error(errMsg === 'SOURCE_UNAVAILABLE' ? errMsg : 'SOURCE_UNAVAILABLE')
			}
			return { url: fakeAudioMp3Uri, wasCached: false }
		}
	}

	return { url: musicItem.url, wasCached: false }
}
