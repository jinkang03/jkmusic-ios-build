/**
 * 音源按平台逐个测试（不再只测酷我）。
 *
 * 每个平台用「该平台真实搜索到的曲目」去测，而不是拿酷我的 id 去问所有平台
 * （不同平台 id 体系不同，会全部误判失败）。
 */
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { logInfo } from '@/helpers/logger'

export const ALL_PLATFORMS = ['kw', 'kg', 'tx', 'wy', 'mg'] as const

export type PlatformTestResult = { src: string, ok: boolean, note: string }

const timeout = <T>(ms: number, message: string) =>
	new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))

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

	const results: PlatformTestResult[] = []
	const testOne = async(src: string): Promise<PlatformTestResult> => {
		try {
			const { searchBySource } = await import('@/jk/musicSdk')
			let title = '稻香'
			let singer = '周杰伦'
			let id = '228908'
			let meta: any = undefined
			try {
				const found = await Promise.race([
					searchBySource(src as any, '稻香 周杰伦', 1),
					timeout<any[]>(6000, 'search timeout'),
				]) as any[]
				const hit = (found ?? [])[0]
				if (hit?.id) {
					title = String(hit.name ?? title)
					singer = String(hit.singer ?? singer)
					id = String(hit.id)
					meta = hit
				}
			} catch { /* 搜索失败就用固定曲目兜底 */ }
			const url = await Promise.race([
				reloaded.getMusicUrl(title, singer, id, '128k', { requestType: 'test' }, src, meta),
				timeout<string>(10000, 'test timeout'),
			])
			return { src, ok: !!url, note: url ? '' : 'empty url' }
		} catch (err) {
			return { src, ok: false, note: String((err as any)?.message ?? err).slice(0, 48) }
		}
	}

	// 并发测所有平台：串行 5 个平台最坏要等 60s+
	await Promise.all(platforms.map(async(src) => {
		const result = await testOne(src)
		results.push(result)
		logInfo('[sourceTest]', String(api?.name ?? ''), src, result.ok ? 'ok' : `fail(${result.note})`)
		onProgress?.(results.slice(), platforms)
	}))

	return { platforms, results }
}

export default testSourcePlatforms
