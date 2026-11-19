/**
 * 自定义源（lx-music 脚本）注册表：
 * 桌面版由主进程执行脚本，这里复用 Cymusic 原生 JavaScriptCore 运行时，
 * 把适配后的音源注入 global.lx.apis / qualityList，供 musicSdk 取播放地址。
 *
 * 多源聚合：
 * 原生侧已支持「每个脚本一个独立 runtime」，因此可以同时持有多个脚本。
 * 这里为每个平台维护一条候选链（主脚本优先 + 按实测能力排序），
 * 某个脚本取流失败会自动换下一个，避免「一个脚本挂了整首歌就哑」。
 */

import { logError, logInfo } from '@/helpers/logger'

export interface JkSourceApi {
	getMusicUrl: (musicInfo: any, quality: string) => { promise: Promise<{ url: string, type: string }>, canceleFn?: () => void }
	getLyric?: (musicInfo: any) => { promise: Promise<any>, canceleFn?: () => void }
	getPic?: (musicInfo: any) => { promise: Promise<string>, canceleFn?: () => void }
}

type Registry = Record<string, JkSourceApi>

const state = {
	apis: {} as Registry,
	qualityList: {} as Record<string, string[]>,
}

/** 每个脚本支持的平台（来自脚本 init 上报的 sources） */
type PoolEntry = {
	api: any
	sources: string[]
	order: number
}

const pool: PoolEntry[] = []
let primaryApi: any = null

/**
 * 脚本优先级（按实测能力，越靠前越优先）。
 * 名字用 includes 匹配，脚本改名后仍能命中；
 * 主脚本永远排第一，不受此表影响。
 */
const SOURCE_PREFERENCE: Record<string, string[]> = {
	// 安妮的 kw 是直连（nmobi.kuwo.cn），实测最稳；回避的代理对 128k 会返回 400
	kw: ['安妮', 'HelloWorld', '回避', '墨澜', '裤佬', '星海'],
	tx: ['回避', '墨澜', 'HelloWorld', '裤佬', '安妮', '星海'],
	wy: ['安妮', '回避', '墨澜', 'HelloWorld', '裤佬', '星海'],
	mg: ['HelloWorld', '星海', '裤佬', '墨澜', '回避'],
	kg: ['回避', '裤佬', '墨澜', 'HelloWorld', '安妮', '星海'],
}

const ensureGlobal = () => {
	const g: any = globalThis as any
	g.lx = g.lx ?? {}
	g.lx.apis = state.apis
	g.lx.qualityList = state.qualityList
}

ensureGlobal()

/** 注册/覆盖某个源（kw/kg/tx/wy/mg）的取地址能力 */
export const registerSourceApi = (source: string, api: Partial<JkSourceApi>, qualitys?: string[]) => {
	const current = state.apis[source] ?? ({} as JkSourceApi)
	state.apis[source] = { ...current, ...api }
	if (qualitys?.length) state.qualityList[source] = qualitys
	ensureGlobal()
}

export const unregisterSourceApi = (source: string) => {
	delete state.apis[source]
	delete state.qualityList[source]
	ensureGlobal()
}

export const clearSources = () => {
	for (const key of Object.keys(state.apis)) delete state.apis[key]
	for (const key of Object.keys(state.qualityList)) delete state.qualityList[key]
	ensureGlobal()
}

/**
 * 轻量校验：拿到 URL 后先发一个 Range 请求（0-0），避免把 4xx 的坏链当成功。
 * 有些 CDN 不支持 Range，返回 200 也放行；只有明确的 4xx/5xx 才判失败。
 */
const verifyMediaUrl = async(url: string): Promise<boolean> => {
	try {
		const ctrl = new AbortController()
		const timer = setTimeout(() => ctrl.abort(), 3000)
		const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: ctrl.signal })
		clearTimeout(timer)
		return res.status < 400
	} catch {
		return false
	}
}

const withScriptTimeout = <T>(work: Promise<T>, ms: number, label: string): Promise<T> =>
	Promise.race([
		work,
		new Promise<T>((_, reject) => {
			setTimeout(() => reject(new Error(`${label} 超时 ${ms}ms`)), ms)
		}),
	])

const sourceScore = (source: string, entry: PoolEntry) => {
	const names = SOURCE_PREFERENCE[source] ?? []
	const name = String(entry.api?.name ?? '')
	const hit = names.findIndex(n => name.includes(n))
	// 命中偏好表的按表排序；主脚本只有在同样未命中时才靠前，
	// 否则「主脚本永远第一」会压过实测更稳的脚本（例如 kw 128k）
	if (hit >= 0) return hit
	if (entry.api === primaryApi) return 50
	return 100 + entry.order
}

/** 为某平台生成候选链（主脚本优先，其次按优先级表） */
const candidatesFor = (source: string) =>
	pool
		.filter(entry => entry.sources.includes(source))
		.sort((a, b) => sourceScore(source, a) - sourceScore(source, b))

/**
 * 池化取流：并发交给所有候选脚本，先成功的先用。
 * 注意：这里返回 { promise } 是因为 musicSdk 的调用约定。
 */
const makePooledGetter = (source: string) => (musicInfo: any, quality: string) => {
	const songmid = String(musicInfo?.songmid ?? musicInfo?.id ?? '')
	const promise = getPooledMusicUrl(
		musicInfo?.name ?? musicInfo?.title,
		musicInfo?.singer ?? musicInfo?.artist,
		songmid,
		quality,
		source,
		musicInfo,
	).then(url => ({ url, type: quality }))
	return { promise }
}

/** 重建 global.lx.apis：每个平台一条候选链 */
const rebuildRegistry = () => {
	clearSources()
	const sources = new Set<string>()
	for (const entry of pool) {
		for (const s of entry.sources) sources.add(s)
	}
	for (const source of sources) {
		if (!candidatesFor(source).length) continue
		registerSourceApi(source, { getMusicUrl: makePooledGetter(source) }, ['128k', '320k', 'flac'])
	}
}

/** 绑定主脚本（兼容旧的单选模型） */
export const bindMusicApi = (api: any) => {
	if (!api) {
		primaryApi = null
		pool.length = 0
		rebuildRegistry()
		return
	}
	if (api.__pooled) {
		// 包装层只用于对外调用；候选池里必须是原始脚本对象，
		// 否则池化取流会回调到自己，造成无限递归。
		const origin = pool.find(entry => entry.api?.id === api.__originId)
		primaryApi = origin?.api ?? null
		rebuildRegistry()
		logInfo(`[jk/source] primary=${String(api?.name ?? '')} pool=${pool.length}`)
		return
	}
	primaryApi = api
	if (api?.getMusicUrl && Array.isArray(api?.supportedSources) && api.supportedSources.length) {
		const existing = pool.find(entry => entry.api?.id === api.id)
		if (existing) {
			existing.api = api
			existing.sources = api.supportedSources
		} else {
			pool.push({ api, sources: api.supportedSources, order: pool.length })
		}
		rebuildRegistry()
		logInfo(`[jk/source] registered ${Object.keys(state.apis).join(',')} (primary=${String(api?.name ?? '')})`)
		return
	}
	if (!api?.getMusicUrl) return
	// 未上报源的脚本按旧逻辑跳过，避免把请求发到错误的平台
	logError('[jk/source] 音源没有上报任何源，跳过注册', api?.name)
}

/** 设置完整脚本池（多源聚合入口） */
export const setSourcePool = (apis: any[]) => {
	pool.length = 0
	for (const api of apis) {
		if (!api?.getMusicUrl) continue
		if (!Array.isArray(api?.supportedSources) || !api.supportedSources.length) continue
		pool.push({ api, sources: api.supportedSources, order: pool.length })
	}
	rebuildRegistry()
	logInfo(
		`[jk/source] pool=${pool.length}`,
		pool.map(entry => `${String(entry.api?.name ?? '?')}(${entry.sources.join('/')})`).join(' | '),
	)
}

/**
 * 池化取流（供 MusicSourceResolver 直接调用）。
 * 与 registry 中的 getMusicUrl 等价，但返回 Promise<string>。
 */
export const getPooledMusicUrl = async (
	title: string,
	artist: string,
	songmid: string,
	quality: string,
	source: string,
	meta?: Record<string, any>,
): Promise<string> => {
	const candidates = candidatesFor(source)
	if (!candidates.length) throw new Error(`没有可用脚本支持 ${source}`)

	// 并发竞速：同一首歌同时交给所有候选脚本，谁先给出可用地址就用谁。
	// 串行时「一个脚本超时」会直接叠到用户等待时间上（kg 场景 8s+5s），
	// 并发后总耗时 ≈ 最慢成功脚本的耗时。
	const attempts = candidates.map((entry) => {
		const api = entry.api
		return (async() => {
			try {
				const url = await withScriptTimeout(
					api.getMusicUrl(title, artist, songmid, quality, { requestType: 'current' }, source, meta),
					// 必须小于 MusicSourceResolver 的外层 5s 超时：否则外层先抛「请求超时」，
					// 拿不到「所有脚本均失败」这个整源失败信号，会白白降音质重试 3 轮（15 秒）
					4000,
					String(api?.name ?? '脚本'),
				)
				if (typeof url === 'string' && /^https?:/.test(url)) {
					const ok = await verifyMediaUrl(url)
					if (!ok) throw new Error(`${String(api?.name ?? '')} 返回的地址不可下载(4xx)`)
					if (entry !== candidates[0]) {
						logInfo(`[jk/source] 取流兜底 ${source}: ${String(candidates[0]?.api?.name ?? '')} -> ${String(api?.name ?? '')}`)
					}
					return url
				}
				throw new Error(`脚本 ${String(api?.name ?? '')} 返回空地址`)
			} catch (err) {
				logInfo(
					`[jk/source] 脚本取流失败 ${source}/${String(api?.name ?? '')}:`,
					String((err as any)?.message ?? err).slice(0, 120),
				)
				throw err
			}
		})()
	})

	try {
		return await Promise.any(attempts)
	} catch (err) {
		const errors = (err as any)?.errors ?? [err]
		// 统一成「所有脚本…」前缀：调用方据此判定为整源失败，跳过降音质重试
		const detail = errors.map((e: any) => String(e?.message ?? e)).join(' | ').slice(0, 160)
		throw new Error(`所有脚本均失败(${source}): ${detail}`)
	}
}

export const getRegisteredSources = () => Object.keys(state.apis)

export const hasSource = (source: string) => !!state.apis[source]

export const getSourcePool = () => pool.map(entry => ({ name: String(entry.api?.name ?? ''), sources: [...entry.sources] }))

export default {
	registerSourceApi,
	unregisterSourceApi,
	clearSources,
	getRegisteredSources,
	hasSource,
	bindMusicApi,
	setSourcePool,
	getPooledMusicUrl,
	getSourcePool,
}
