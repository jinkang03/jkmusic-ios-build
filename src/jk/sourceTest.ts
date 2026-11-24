/**
 * 音源按平台逐个测试。
 *
 * 每个平台用「该平台自己搜索到的曲目」去测：
 * 搜得到说明平台有这个版权，取流/拉流失败才是真的不能播（VIP/试听/接口坏）。
 * 3 个不同年代的样本，结果记为 x/3，避免「一首歌过了就全绿」的错觉。
 */
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { logInfo } from '@/helpers/logger'

export const ALL_PLATFORMS = ['kw', 'kg', 'tx', 'wy', 'mg'] as const

export type PlatformTestResult = {
	src: string
	/** 至少一首通过（接口可用） */
	ok: boolean
	passed: number
	total: number
	/** 失败摘要，例如 `Shape of You: http 403` */
	note: string
}

type Sample = { query: string, title: string }

/** 三个不同年代/语种的查询词；命中用各平台自己的搜索结果 */
const SAMPLES: Sample[] = [
	{ query: '稻香 周杰伦', title: '稻香' },
	{ query: '起风了 买辣椒也用券', title: '起风了' },
	{ query: 'Shape of You Ed Sheeran', title: 'Shape of You' },
]

const timeout = <T>(ms: number, message: string) =>
	new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))

/**
 * 真正验证地址可播：Range 请求前 32KB，要求 200/206、不是 HTML、且真的返回数据。
 */
const verifyPlayableUrl = async(url: string): Promise<{ ok: boolean, note: string, timeout?: boolean }> => {
	if (!/^https?:/i.test(url)) return { ok: false, note: 'not http url' }
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
	const timer = setTimeout(() => controller?.abort(), 6000)
	try {
		const res = await fetch(url, {
			headers: {
				Range: 'bytes=0-32767',
				// 部分 CDN 按 UA 放行；用 AVPlayer 的 UA，避免测试比真实播放更严格
				'User-Agent': 'AppleCoreMedia/1.0.0 (iPhone; U; CPU OS 17_0 like Mac OS X; en_us)',
				Accept: '*/*',
			},
			signal: controller?.signal,
		})
		if (res.status !== 200 && res.status !== 206) {
			return { ok: false, note: `http ${res.status}` }
		}
		const ct = String(res.headers.get('content-type') ?? '').toLowerCase()
		if (ct.includes('text/html') || ct.includes('application/json')) {
			return { ok: false, note: `bad type ${ct.slice(0, 20)}` }
		}
		const buf = await res.arrayBuffer()
		if (!buf || buf.byteLength < 1024) {
			return { ok: false, note: `empty body ${buf?.byteLength ?? 0}B` }
		}
		return { ok: true, note: '' }
	} catch (err) {
		const msg = String((err as any)?.message ?? err)
		const aborted = msg.toLowerCase().includes('abort')
		return { ok: false, note: aborted ? 'timeout' : msg.slice(0, 40), timeout: aborted }
	} finally {
		clearTimeout(timer)
	}
}

export const testSourcePlatforms = async(
	api: IMusic.MusicApi,
	onProgress?: (done: PlatformTestResult[], platforms: string[]) => void,
): Promise<{ platforms: string[], results: PlatformTestResult[] }> => {
	const reloaded = await myTrackPlayer.reloadMusicApi({ ...api, isSelected: true }, true)
	if (typeof reloaded.getMusicUrl !== 'function') throw new Error('getMusicUrl unavailable')

	const declared = (((reloaded as any).supportedSources ?? (api as any).supportedSources ?? []) as string[])
		.map(v => String(v))
		.filter(v => (ALL_PLATFORMS as readonly string[]).includes(v))
	const platforms = Array.from(new Set(declared.length ? declared : (ALL_PLATFORMS as readonly string[])))

	// 用当前播放音质测试，否则「128k 能取到、实际音质取不到」会被误判为可用
	let quality = '128k'
	try {
		const { getSetting } = await import('@/jk/settingsStore')
		quality = String(getSetting('music.quality', '128k'))
	} catch { /* ignore */ }

	const results: PlatformTestResult[] = []
	const done: PlatformTestResult[] = []

	const testSample = async(src: string, sample: Sample) => {
		const { searchBySource } = await import('@/jk/musicSdk')
		let hit: any = null
		try {
			const found = await Promise.race([
				searchBySource(src as any, sample.query, 1),
				timeout<any[]>(5000, 'search timeout'),
			]) as any[]
			hit = (found ?? [])[0]
		} catch (err) {
			return { ok: false, note: `搜索失败`, timeout: String((err as any)?.message ?? '').includes('timeout') }
		}
		if (!hit?.id) return { ok: false, note: '搜索无结果', timeout: false }
		try {
			const url = await Promise.race([
				reloaded.getMusicUrl(
					String(hit.name ?? sample.title),
					String(hit.singer ?? ''),
					String(hit.id),
					quality as any,
					{ requestType: 'test' },
					src,
					hit,
				),
				timeout<string>(10000, 'test timeout'),
			])
			if (!url) return { ok: false, note: 'empty url', timeout: false }
			const check = await verifyPlayableUrl(String(url))
			return { ok: check.ok, note: check.note, timeout: !!check.timeout }
		} catch (err) {
			const msg = String((err as any)?.message ?? err)
			return { ok: false, note: msg.includes('timeout') ? 'timeout' : msg.slice(0, 40), timeout: msg.includes('timeout') }
		}
	}

	const testOne = async(src: string): Promise<PlatformTestResult> => {
		let passed = 0
		let timeouts = 0
		const failures: string[] = []
		for (const sample of SAMPLES) {
			const r = await testSample(src, sample)
			if (r.ok) {
				passed++
			} else {
				failures.push(`${sample.title}: ${r.note}`)
				if (r.timeout) timeouts++
				// 两首连续超时基本就是网络/接口挂了，省下第三首的时间
				if (timeouts >= 2) break
			}
		}
		const total = SAMPLES.length
		return {
			src,
			ok: passed > 0,
			passed,
			total,
			note: failures.slice(0, 3).join('; '),
		}
	}

	// 并发测所有平台（每个平台内部串行跑 3 首）
	await Promise.all(platforms.map(async(src) => {
		const result = await testOne(src)
		results.push(result)
		done.push(result)
		logInfo('[sourceTest]', String(api?.name ?? ''), src,
			`${result.passed}/${result.total}`, result.note ? `fail(${result.note})` : 'ok')
		onProgress?.(done.slice(), platforms)
	}))

	return { platforms, results }
}

export default testSourcePlatforms
