/**
 * 试听片段检测与自动换源。
 *
 * 背景：VIP 曲目在多数平台只给 15~30 秒试听，接口本身是成功的，
 * 所以现有「请求失败才换源」的逻辑永远不触发，用户看到的是「能播但只有 14 秒」。
 * 这里用「音频实际时长 vs 曲目声明时长」判定试听，命中后去其它平台找同一首歌。
 */
import { logError, logInfo } from '@/helpers/logger'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { searchBySource, type JKMusic, type JKSource } from './musicSdk'
import { jkToTrack } from './adapt'

/** 判定：音频时长明显短于曲目声明时长 → 试听片段 */
export const isTrialClip = (audioDurationSec: number, trackDurationSec: number) => {
	if (!audioDurationSec || audioDurationSec <= 0) return false
	if (!trackDurationSec || trackDurationSec <= 0) return audioDurationSec < 30
	return audioDurationSec < Math.min(60, trackDurationSec * 0.6)
}

const ALL_SOURCES: JKSource[] = ['kw', 'kg', 'tx', 'wy', 'mg']

/** 每首歌最多换 2 个源，避免试听循环 */
const MAX_SWITCH = 2
const attempted = new Map<string, Set<string>>()
const handled = new Set<string>()

/** 每次换源的序号，旧的异步回调据此作废（防重入） */
let switchSeq = 0

const keyOf = (track: any) => `${track?.platform ?? '?'}:${track?.id ?? track?.title ?? '?'}`

/** 在其它平台按「歌名 + 歌手」找同一首歌；tried 里的源直接跳过 */
const findAlternative = async(track: any, tried: Set<string>): Promise<JKMusic | null> => {
	const query = `${track?.title ?? ''} ${track?.artist ?? ''}`.trim()
	if (!query) return null
	const currentSource = String(track?.platform ?? '')
	for (const source of ALL_SOURCES) {
		if (source === currentSource || tried.has(source)) continue
		try {
			const list = await searchBySource(source, query, 1, 5)
			const hit = (list ?? []).find((item: any) =>
				String(item.name ?? '').replace(/\s+/g, '') === String(track?.title ?? '').replace(/\s+/g, ''),
			) ?? null
			if (hit) return hit
		} catch (err) {
			logInfo('[jk/trial] search failed', source, String((err as any)?.message ?? err))
		}
	}
	return null
}

/**
 * 命中试听后调用：找替代源并播放。
 * 用 for 循环遍历候选源（不用递归，避免爆栈），每次失败都把源写进 tried。
 */
export const switchAwayFromTrial = async(track: any): Promise<string | null> => {
	const mySeq = ++switchSeq
	if (!throttleOk(keyOf(track))) {
		logInfo('[jk/trial] 30 秒内已换过一次，跳过', keyOf(track))
		return null
	}
	const tried = attempted.get(keyOf(track)) ?? new Set<string>()
	attempted.set(keyOf(track), tried)

	// 1) 先暂停：避免旧曲目的进度事件干扰后面的轮询判定
	try {
		await myTrackPlayer.pause()
	} catch (err) {
		logInfo('[jk/trial] pause failed', String((err as any)?.message ?? err))
	}

	while (tried.size < MAX_SWITCH) {
		if (mySeq !== switchSeq) {
			logInfo('[jk/trial] seq 过期，放弃本次换源', mySeq, switchSeq)
			return null
		}

		const alt = await findAlternative(track, tried)
		if (!alt) {
			logInfo('[jk/trial] 没有更多候选源', keyOf(track), Array.from(tried))
			break
		}
		// 记录已尝试：无论成功失败都写回，避免同一源被反复试
		tried.add(String(alt.source))
		attempted.set(keyOf(track), tried)

		// 2) 关键：新曲目 url 必须清空，否则 MusicSourceResolver 当成"已解析"复用旧地址
		// 诊断：确认 alt 用的是目标源自己的 songmid，而不是原曲的
		logInfo('[jk/trial] alt =', JSON.stringify({
			source: alt.source, id: alt.id, songmid: (alt as any).meta?.songmid, name: alt.name,
		}))
		const altTrack: any = { ...jkToTrack(alt), url: '' }
		logInfo('[jk/trial] altTrack =', JSON.stringify({
			id: altTrack.id, platform: altTrack.platform, songmid: altTrack.songmid,
			lxSongmid: (altTrack as any).lxMusic?.meta?.songmid,
		}))
		logInfo(`[jk/trial] switch ${keyOf(track)} -> ${alt.source}:${alt.id} ${alt.name} (url cleared)`)

		try {
			await myTrackPlayer.playWithReplacePlayList(altTrack, [altTrack])
		} catch (err) {
			logError('[jk/trial] playWithReplacePlayList failed', String((err as any)?.message ?? err))
			continue
		}

		// 3) 显式等待起播：最多 8 秒，拿到 position > 0 视为成功
		const started = await waitForPosition(8000)
		if (mySeq !== switchSeq) return null
		if (started) {
			logInfo(`[jk/trial] playing from ${alt.source} ok`)
			handled.add(keyOf(altTrack))
			// 换源后等 6 秒看新音源是不是也短：是的话说明各平台都只有试听，
			// 直接收手（不再切下一个源，避免"切→还是试听→再切"的死循环）
			const stillTrial = await isStillTrialAfterSwitch(altTrack, 6000)
			if (stillTrial) {
				logInfo('[jk/trial] 换源后仍是试听，判定各平台均为试听', keyOf(altTrack))
				return '__all_trial__'
			}
			return String(alt.source)
		}
		logError(`[jk/trial] ${alt.source} 起播超时（8s position 仍为 0）`)
	}

	logInfo('[jk/trial] 换源失败，保留当前曲目', keyOf(track), Array.from(tried))
	return null
}

/** 换源后检查新曲目是否仍是试听片段 */
const isStillTrialAfterSwitch = async(track: any, waitMs: number): Promise<boolean> => {
	const deadline = Date.now() + waitMs
	while (Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 800))
		try {
			const p: any = myTrackPlayer.getProgress()
			const dur = Number(p?.duration ?? 0)
			const expect = Number(track?.duration ?? 0)
			if (dur > 0) return isTrialClip(dur, expect)
		} catch {
			// 忽略瞬时错误
		}
	}
	return false
}

/** 同一首歌 30 秒内最多触发一次换源，避免抖动 */
const lastSwitchAt = new Map<string, number>()
const throttleOk = (key: string) => {
	const now = Date.now()
	const last = lastSwitchAt.get(key) ?? 0
	if (now - last < 30000) return false
	lastSwitchAt.set(key, now)
	return true
}

/** 轮询 position，返回是否真的开始往前走 */
const waitForPosition = async(timeoutMs: number): Promise<boolean> => {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 500))
		try {
			const progress: any = myTrackPlayer.getProgress()
			if (progress?.position > 0) return true
		} catch {
			// 忽略瞬时错误，继续等
		}
	}
	return false
}

/** 每首歌只处理一次 */
export const markHandled = (track: any) => {
	handled.add(keyOf(track))
}

export const wasHandled = (track: any) => handled.has(keyOf(track))

/** 试听提示文案 */
export const trialHint = (trackDurationSec: number) => {
	if (!trackDurationSec || trackDurationSec <= 0) return '当前为试听片段'
	const m = Math.floor(trackDurationSec / 60)
	const s = Math.floor(trackDurationSec % 60)
	return `当前为试听片段（完整 ${m}:${String(s).padStart(2, '0')}）`
}
