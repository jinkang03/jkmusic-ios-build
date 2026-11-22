import { sortIndexSymbol, timeStampSymbol } from '@/constants/commonConst'
import { SoundAsset } from '@/constants/constant'
import Config from '@/store/config'
import { getSetting, setSetting } from '@/jk/settingsStore'
import delay from '@/utils/delay'
import { isSameMediaItem, mergeProps, sortByTimestampAndIndex } from '@/utils/mediaItem'
import * as FileSystem from 'expo-file-system/legacy'
import { Paths } from 'expo-file-system'
import { produce } from 'immer'
import shuffle from 'lodash.shuffle'
import FileSystemNative from '../../modules/cymusic-native'
import ReactNativeTrackPlayer, {
	Event,
	PlaybackState,
	type MediaItem,
	type PlaybackProgressUpdatedEvent,
	usePlaybackState,
	useProgress,
} from '@rntp/player'
import type { Track } from '@/player/types'
import { getNativeTrackIdentity, toMediaItem } from '@/player/mediaItem'

import { MusicRepeatMode } from '@/helpers/types'
import PersistStatus from '@/store/PersistStatus'
import {
	getMusicIndex,
	getPlayList,
	getPlayListMusicAt,
	isInPlayList,
	isPlayListEmpty,
	setPlayList,
	usePlayList,
} from '@/store/playList'
import { createMediaIndexMap } from '@/utils/mediaIndexMap'
import { Alert, AppState, Image } from 'react-native'

import { fetchLyric } from '@/jk/lyric'
import LyricManager from './lyricManager'

import { fakeAudioMp3Uri } from '@/constants/images'
import { nowLanguage } from '@/utils/i18n'
import { showToast } from '@/utils/utils'
import { resolveLocalFile } from './localFile'
import { downloadFile } from './fileDownload'
import { logError, logInfo } from './logger'
import { disposeLxMusicScript, isLxMusicScript, reloadLxMusicScript } from './userApi/lxMusicSourceAdapter'

import {
	currentMusicStore,
	playListsStore,
	repeatModeStore,
	qualityStore,
	musicApiStore,
	musicApiSelectedStore,
	nowApiState,
	autoCacheLocalStore,
	isCachedIconVisibleStore,
	songsNumsToLoadStore,
	importedLocalMusicStore,
	nowLyricState,
	nowLxLyricState,
	nowTlyricState,
	trackSkipLoadingStore,
	trackSourceLoadingStore,
	playbackIntentStore,
	pendingRestorePositionStore,
} from '@/player/PlayerStore'

import {
	isCached,
	downloadToCache,
	clearCache,
	getLocalFilePath,
	getCacheFileUri,
	ensureCacheDirExists,
	ensureDirExists,
} from '@/player/CacheManager'

import { resolveSource, preloadSource } from '@/player/MusicSourceResolver'
import { bindMusicApi, getPooledMusicUrl, setSourcePool } from '@/jk/sourceRegistry'

const NEXT_TRACK_PRELOAD_DELAY_MS = 8000
const createTrackSourceLoadingToken = (musicItem: IMusic.IMusicItem) =>
	`track_source_${musicItem.id}_${Date.now().toString(36)}_${Math.random()
		.toString(36)
		.slice(2, 8)}`

export {
	playListsStore,
	repeatModeStore,
	qualityStore,
	musicApiStore,
	musicApiSelectedStore,
	nowApiState,
	autoCacheLocalStore,
	isCachedIconVisibleStore,
	songsNumsToLoadStore,
	importedLocalMusicStore,
	nowLyricState,
	nowTlyricState,
	trackSkipLoadingStore,
	trackSourceLoadingStore,
	playbackIntentStore,
	pendingRestorePositionStore,
}

export function useCurrentQuality() {
	const currentQuality = qualityStore.useValue()
	const setCurrentQuality = (newQuality: IMusic.IQualityKey) => {
		setQuality(newQuality)
	}
	return [currentQuality, setCurrentQuality] as const
}

let currentIndex = -1

let playerSubscriptions: { remove(): void }[] = []
let controlRevision = 0
let activeTrackSkip: symbol | null = null
// 播放进度保存（mac 的 player.isSavePlayTime）：5 秒节流，切歌/暂停时立即写
const PROGRESS_SAVE_INTERVAL_MS = 5000
let lastProgressSaveAt = 0

const persistCurrentProgress = () => {
	const music: any = currentMusicStore.getValue()
	if (!music) return
	let position = 0
	let duration = 0
	try {
		const progress: any = ReactNativeTrackPlayer.getProgress?.() ?? {}
		position = Number(progress?.position ?? 0)
		duration = Number(progress?.duration ?? 0)
	} catch { /* ignore */ }
	void import('@/player/playProgress').then(m => m.savePlayProgress({
		trackId: String(music.id ?? ''),
		platform: String(music.platform ?? ''),
		index: currentIndex,
		position,
		duration,
	})).catch(() => undefined)
}
let nativeQueue: {
	token: string
	track: Track
	startedAt: number
	handoffConsumed: boolean
} | null = null

/** Validate against the current native queue, not a queued event's index alone. */
function isCurrentNativeItem(item: MediaItem | null | undefined, placeholder = false) {
	if (!nativeQueue || !isCurrentMusic(nativeQueue.track as IMusic.IMusicItem)) return false
	const identity = getNativeTrackIdentity(item)
	const active = ReactNativeTrackPlayer.getActiveMediaItem()
	const activeIdentity = getNativeTrackIdentity(active)
	return identity?.token === nativeQueue.token &&
		identity.placeholder === placeholder &&
		activeIdentity?.token === nativeQueue.token &&
		activeIdentity.placeholder === placeholder &&
		item?.mediaId === active?.mediaId &&
		ReactNativeTrackPlayer.getActiveMediaItemIndex() === (placeholder ? 1 : 0)
}

function isCurrentProgressEvent(event: PlaybackProgressUpdatedEvent) {
	const active = ReactNativeTrackPlayer.getActiveMediaItem()
	return isCurrentNativeItem(active) && event.mediaId === active?.mediaId &&
		Number.isFinite(event.timestamp) && event.timestamp >= nativeQueue.startedAt
}

function setPlaybackIntent(intent: 'play' | 'pause' | 'stop') {
	controlRevision++
	playbackIntentStore.setValue(intent)
	// 恢复播放/停止都重置停滞计时：暂停期间累计的「不动」不算卡住
	streamGuardLastAdvanceAt = Date.now()
	streamGuardLastTick = Date.now()
	if (intent === 'play') streamGuardHalted = false
}

function retireTrackSkip() {
	activeTrackSkip = null
	trackSkipLoadingStore.setValue(null)
}

function handleNativeTransition(item: MediaItem | null | undefined, index: number | null) {
	// clear() can omit item entirely. A duplicate/stale placeholder must not advance.
	if (item == null || index !== 1 || !isCurrentNativeItem(item, true) ||
		nativeQueue.handoffConsumed || trackSourceLoadingStore.getValue() !== null ||
		playbackIntentStore.getValue() !== 'play') return
	nativeQueue.handoffConsumed = true
	logInfo('队列末尾，播放下一首')
	const advance = repeatModeStore.getValue() === MusicRepeatMode.SINGLE
		? play(null, true)
		: skipToNext()
	void advance.catch((error) => logError('自动切歌失败', error))
}

function observeNativeTransport(intent: 'play' | 'pause' | 'stop') {
	// Hybrid transport already ran natively. Only reconcile pending JS work here.
	setPlaybackIntent(intent)
	if (intent === 'play') {
		// Pause can arrive before a queued placeholder transition reaches JS. A
		// later native resume must complete that deferred business-queue handoff.
		handleNativeTransition(ReactNativeTrackPlayer.getActiveMediaItem(), ReactNativeTrackPlayer.getActiveMediaItemIndex())
	}
}

function reset() {
	controlRevision++
	retireTrackSkip()
	playbackIntentStore.setValue('stop')
	trackSourceLoadingStore.setValue(null)
	nativeQueue = null
	clearPlayWatchdog()
	resetStreamGuards()
	altTriedMap.clear()
	ReactNativeTrackPlayer.clear()
}

const hotModule = module as typeof module & { hot?: { dispose(callback: () => void): void } }
hotModule.hot?.dispose(() => {
	reset()
	playerSubscriptions.forEach((subscription) => subscription.remove())
	playerSubscriptions = []
})

function migrate() {
	PersistStatus.set('music.rate', 1)
	PersistStatus.set('music.repeatMode', MusicRepeatMode.QUEUE)
	PersistStatus.set('music.progress', 0)
	Config.set('status.music', undefined)
}

/**
 * 全新安装 / 用户删除了全部脚本时，加载内置音源，保证开箱可用。
 */
async function ensureBuiltinSources(): Promise<IMusic.MusicApi | null> {
	// 内置脚本会把 100KB+ 的 lx 脚本内联进 JS bundle，Release minify 阶段耗时失控，
	// 因此改为不内联：没有脚本时只做提示，由「设置 → 音源管理」导入。
	// 多脚本聚合 + 跨源兜底保证导入后即便某个源失效也能出声。
	logInfo('[jk/source] 未导入任何音源脚本：请在「设置 → 音源管理」导入')
	return null
}

async function setupTrackPlayer() {
	migrate()
	// 一次性清理旧版本留在 musicCache 里的手动下载（新版本改为 downloads/ 独立目录）
	void import('@/jk/downloadStore').then(m => m.purgeLegacyManualDownloads()).catch(() => undefined)
	const rate = PersistStatus.get('music.rate')
	const musicQueue = PersistStatus.get('music.play-list')
	const legacyMusicQueue = PersistStatus.get('music.playList')
	const repeatMode = PersistStatus.get('music.repeatMode')
	const progress = PersistStatus.get('music.progress')
	const track = PersistStatus.get('music.musicItem')
	// music.quality 以 settingsStore 为唯一真源（下载链路也读它），PersistStatus 只做旧版本回填
	const quality = getSetting<IMusic.IQualityKey>('music.quality', PersistStatus.get('music.quality') || '128k')
	const playLists = PersistStatus.get('music.playLists')
	const musicApiLists = PersistStatus.get('music.musicApi')
	const selectedMusicApi = PersistStatus.get('music.selectedMusicApi')
	const importedLocalMusic = PersistStatus.get('music.importedLocalMusic')
	const autoCacheLocal = PersistStatus.get('music.autoCacheLocal') ?? true
	const language = PersistStatus.get('app.language') ?? 'zh'
	const isCachedIconVisible = PersistStatus.get('music.isCachedIconVisible') ?? true
	const songsNumsToLoad = PersistStatus.get('music.songsNumsToLoad') ?? 100
	const restoredQueue = musicQueue ?? legacyMusicQueue

	if (!musicQueue && legacyMusicQueue) {
		PersistStatus.set('music.play-list', legacyMusicQueue)
		PersistStatus.set('music.playList', undefined)
	}
	// 状态恢复
	// 播放倍速 / 音量：设置项是唯一真源（与桌面版语义一致），music.rate 只做旧版本兼容回填
	const playbackRate = Number(getSetting<number>('player.playbackRate', 1))
	const effectiveRate = Number.isFinite(playbackRate) && playbackRate > 0
		? playbackRate
		: (rate ? +rate : 1)
	ReactNativeTrackPlayer.setPlaybackSpeed(effectiveRate)
	PersistStatus.set('music.rate', effectiveRate)
	const savedVolume = Number(getSetting<number>('player.volume', 1))
	ReactNativeTrackPlayer.setVolume(
		Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : 1,
	)
	if (repeatMode) {
		repeatModeStore.setValue(repeatMode as MusicRepeatMode)
	}

	if (quality) {
		setQuality(quality as IMusic.IQualityKey)
	}
	if (playLists) {
		const cleanSongUrl = (song: any) => {
			if (!song) return song
			const { url, ...rest } = song
			return rest
		}
		const resolvedPlayLists = await Promise.all(
			playLists.map(async (playList) => {
				const [artwork, coverImg] = await Promise.all([
					resolveLocalFile(playList.artwork),
					resolveLocalFile(playList.coverImg),
				])
				return {
				...playList,
				songs: Array.isArray((playList as any).songs) ? (playList as any).songs.map(cleanSongUrl) : (playList as any).songs,
				...(artwork.status === 'resolved' ? { artwork: artwork.fileUri } : {}),
				...(coverImg.status === 'resolved' ? { coverImg: coverImg.fileUri } : {}),
				}
			}),
		)
		// Project cover addresses for display only; preserve stored IDs, songs and URLs.
		playListsStore.setValue(resolvedPlayLists)
	}
	if (Array.isArray(musicApiLists) && musicApiLists.length) {
		musicApiStore.setValue(musicApiLists)
	} else {
		await ensureBuiltinSources()
	}
	if (selectedMusicApi) {
		musicApiSelectedStore.setValue(selectedMusicApi)
		bindMusicApi(selectedMusicApi)
		await reloadNowSelectedMusicApi()
	} else if (musicApiSelectedStore.getValue()) {
		// 内置音源刚加载：选中态已在 ensureBuiltinSources 里写好，这里补加载与绑定
		await reloadNowSelectedMusicApi()
	}
	if (importedLocalMusic) {
		importedLocalMusicStore.setValue(importedLocalMusic)
	}
	if (restoredQueue && Array.isArray(restoredQueue)) {
		// 每次重装容器 UUID 都会变，持久化队列里的 file:// 绝对路径必然失效。
		// 恢复时丢掉任何持久化的播放地址（url），需要时再按音源重新解析。
		const sanitize = (item: any) => {
			if (!item) return item
			const { url, ...rest } = item
			return rest
		}
		const cleanedQueue = restoredQueue.map(sanitize)
		logInfo(`[jk/queue] 恢复队列 ${cleanedQueue.length} 首，已清掉持久化 url`)
		addAll(cleanedQueue, undefined, repeatMode === MusicRepeatMode.SHUFFLE)
		// 保存播放进度：把上次播放的曲目设为当前（不播放），并记下待恢复位置
		try {
			const { loadPlayProgress, logSavedProgress } = await import('@/player/playProgress')
			const saved = loadPlayProgress()
			if (saved) {
				const list = getPlayList()
				const idx = list.findIndex((item: any) =>
					String(item?.id ?? '') === saved.trackId &&
					String(item?.platform ?? '') === saved.platform)
				if (idx >= 0) {
					currentIndex = idx
					setCurrentMusic(list[idx] as any)
					pendingRestorePositionStore.setValue(saved.position)
					logSavedProgress(saved)
				}
			}
		} catch { /* ignore */ }
	}
	if (autoCacheLocal == true || autoCacheLocal == false) {
		autoCacheLocalStore.setValue(autoCacheLocal)
	}
	if (isCachedIconVisible == true || isCachedIconVisible == false) {
		isCachedIconVisibleStore.setValue(isCachedIconVisible)
	}
	if (language) {
		nowLanguage.setValue(language)
	}
	if (songsNumsToLoad) {
		songsNumsToLoadStore.setValue(songsNumsToLoad)
	}
	if (playerSubscriptions.length === 0) {
		playerSubscriptions.push(
			ReactNativeTrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (data) => {
				if (!isCurrentProgressEvent(data)) return
				// 进度真的在走 → 源可用，撤掉看门狗
				if (Number((data as any)?.position ?? 0) > 0.5) clearPlayWatchdog()
				const now = Date.now()
				if (now - lastProgressSaveAt < PROGRESS_SAVE_INTERVAL_MS) return
				lastProgressSaveAt = now
				const music: any = currentMusicStore.getValue()
				if (!music) return
				void import('@/player/playProgress').then(m => m.savePlayProgress({
					trackId: String(music.id ?? ''),
					platform: String(music.platform ?? ''),
					index: currentIndex,
					position: Number(data.position ?? 0),
					duration: Number(data.duration ?? 0),
				})).catch(() => undefined)
			}),
			ReactNativeTrackPlayer.addEventListener(Event.MediaItemTransition, (event) => {
				handleNativeTransition(event.item, event.index)
			}),
			ReactNativeTrackPlayer.addEventListener(Event.PlaybackError, (error) => {
				if (!error.message || trackSourceLoadingStore.getValue() !== null ||
					ReactNativeTrackPlayer.getPlaybackState() !== PlaybackState.Error ||
					!isCurrentNativeItem(ReactNativeTrackPlayer.getActiveMediaItem())) return
				logInfo('播放出错', { message: error.message, code: error.code })
				void failToPlay().catch((failure) => logError('播放错误恢复失败', failure))
			}),
		)
		startStreamGuard()
		logInfo('播放器初始化完成')
	}
}

/**
 * 获取自动播放的下一个track，保持nextTrack 不变,生成nextTrack的with fake url 形式  假音频
 * 获取下一个 track 并设置其属性为假音频。这在测试或处理特殊情况时非常有用
 */
const getFakeNextTrack = (): Track => {
	const repeatMode = repeatModeStore.getValue()
	const track = getPlayListMusicAt(currentIndex + (repeatMode === MusicRepeatMode.SINGLE ? 0 : 1))
	return {
		id: track?.id ?? 'empty',
		platform: track?.platform,
		title: track?.title,
		artist: track?.artist,
		album: track?.album,
		artwork: track?.artwork,
		url: Image.resolveAssetSource(SoundAsset.fakeAudio).uri,
	}
}

/**
 * 所有平台都不可用：停住当前曲目并提示，等用户点播放重试。
 * 与 mac 一致——失败不自动切歌，避免一次失败连锁跳掉半张歌单。
 */
async function haltWithNotice(message = '所有平台均不可用，点击播放重试') {
	retireTrackSkip()
	try { await ReactNativeTrackPlayer.pause() } catch { /* ignore */ }
	// 停住后不再自动换源：等用户点播放（play() 会重新武装看护）
	streamGuardHalted = true
	streamGuardLastAdvanceAt = Date.now()
	streamGuardLastPos = -1
	showToast('播放失败', message, 'error')
}

/** 播放失败时的情况 */
/**
 * 播放看门狗：取流成功 ≠ 能播。
 * 实测有些源返回的地址 AVPlayer 拉不动，既不报错也不出声（时长 0、进度不动），
 * 12 秒后按失败处理，走「换源」而不是干等。
 */
let playWatchdogTimer: any = null
const clearPlayWatchdog = () => {
	if (playWatchdogTimer) clearTimeout(playWatchdogTimer)
	playWatchdogTimer = null
}

/**
 * 流式播放的两个运行时看护（不再「先下载再校验」，只能边播边判断）：
 * 1. 试听片段：播到 3 秒后拿实际时长和元信息的时长比，明显偏短 → 换源；
 * 2. 中途停滞：播放中位置连续 15 秒不动（且不是播完）→ 按失败处理换源。
 */
let streamGuardTimer: any = null
let streamGuardLastTick = 0
let streamGuardLastPos = -1
let streamGuardLastAdvanceAt = 0
let streamGuardTruncationChecked = false
let streamGuardRecovering = false
/** 已停住等用户手动重试：期间不再自动触发换源（否则会每 12s 弹一次提示） */
let streamGuardHalted = false

const resetStreamGuards = () => {
	streamGuardHalted = false
	streamGuardLastTick = Date.now()
	streamGuardLastPos = -1
	streamGuardLastAdvanceAt = Date.now()
	streamGuardTruncationChecked = false
	streamGuardRecovering = false
}

const checkStreamTruncation = async(duration: number) => {
	try {
		const music: any = currentMusicStore.getValue()
		if (!music) return
		// 本地文件（下载/导入）不参与：时长本来就该一致，误判反而会换源。
		// 流式播放时 musicItem.url 为空（地址只在播放器里），要继续检测。
		const localUrl = String(music?.url ?? '')
		if (localUrl && !/^https?:/i.test(localUrl)) return
		const { parseIntervalSeconds, intervalOf, isTruncatedAudio } = await import('@/player/audioDuration')
		const rawExpected = parseIntervalSeconds(intervalOf(music))
		// 开发开关：把「应有的时长」放大，用来验证片段检测链路
		const expected = (globalThis as any).__JK_CLIP_SIM__ === true
			? Math.max(rawExpected, 600)
			: rawExpected
		if (!expected || expected < 60) return
		if (!isTruncatedAudio(duration, expected)) return
		logError('[jk/play] 流式时长明显偏短，判定为试听片段',
			`${duration.toFixed(0)}s/${expected}s`, String(music.title ?? ''))
		await failToPlay()
	} catch { /* 检测失败不影响播放 */ }
}

/** 每 5 秒采样一次进度：不依赖 RNTP 进度事件的时间间隔，后台唤醒也不会误判 */
const startStreamGuard = () => {
	if (streamGuardTimer) return
	resetStreamGuards()
	streamGuardTimer = setInterval(() => {
		try {
			const progress: any = ReactNativeTrackPlayer.getProgress?.() ?? {}
			const pos = Number(progress?.position ?? 0)
			const dur = Number(progress?.duration ?? 0)
			const now = Date.now()

			if (playbackIntentStore.getValue() !== 'play') {
				// 暂停/停止不计停滞
				streamGuardLastAdvanceAt = now
				streamGuardLastPos = pos
				streamGuardLastTick = now
				return
			}
			const tickGap = now - streamGuardLastTick
			streamGuardLastTick = now
			// App 挂起后恢复：wall clock 跳变不等于卡住，重新计时
			if (tickGap > 10000) {
				streamGuardLastAdvanceAt = now
				streamGuardLastPos = pos
				return
			}
			if (streamGuardRecovering || streamGuardHalted) return

			// 1) 片段检测：每次换源只查一次
			if (!streamGuardTruncationChecked && dur > 0 && pos > 3) {
				streamGuardTruncationChecked = true
				void checkStreamTruncation(dur)
			}

			// 2) 停滞检测（播完不算）
			const ended = dur > 0 && pos >= dur - 1.5
			if (!ended && Math.abs(pos - streamGuardLastPos) > 0.4) {
				streamGuardLastPos = pos
				streamGuardLastAdvanceAt = now
				return
			}
			if (ended) return
			// 2a) 从未起播：position 和 duration 都是 0（地址连上了但永远不返回数据）
			if (pos <= 0.5 && dur <= 0) {
				if (now - streamGuardLastAdvanceAt > 12000 && !streamGuardRecovering) {
					streamGuardLastAdvanceAt = now
					streamGuardRecovering = true
					logError('[jk/play] 12s 无任何音频数据（duration=0），尝试换源')
					void failToPlay()
						.catch(err => logError('[jk/play] 停滞恢复失败', String((err as any)?.message ?? err)))
						.finally(() => { streamGuardRecovering = false })
				}
				return
			}
			if (pos <= 0.5) return
			if (now - streamGuardLastAdvanceAt > 15000) {
				streamGuardLastAdvanceAt = now
				streamGuardRecovering = true
				logError('[jk/play] 播放停滞 15s（position=', pos.toFixed(1),
					'duration=', dur.toFixed(1), '），尝试换源')
				void failToPlay()
					.catch(err => logError('[jk/play] 停滞恢复失败', String((err as any)?.message ?? err)))
					.finally(() => { streamGuardRecovering = false })
			}
		} catch { /* ignore */ }
	}, 5000)
}

/**
 * 每首歌已尝试过的换源目标（source:id）。
 * 旧实现是一首只换一次；现在允许连续换到所有可用平台，全部失败才停。
 */
const altTriedMap = new Map<string, Set<string>>()
/** 单曲换源上限（≈可用平台数，防止死循环） */
const ALT_MAX_TRIES = 5

const songKeyOf = (item?: any) => `${item?.platform ?? ''}:${item?.id ?? ''}`

/** 手动播放/切歌时重置该曲记录：失败后点播放重试能重新走一遍全部平台 */
const resetAltTried = (item?: any) => {
	const key = songKeyOf(item)
	if (key !== ':') altTriedMap.delete(key)
}

const tryAltSource = async(musicItem: any): Promise<boolean> => {
	const songKey = songKeyOf(musicItem)
	if (!songKey || songKey === ':') return false
	let tried = altTriedMap.get(songKey)
	if (!tried) {
		tried = new Set<string>()
		altTriedMap.set(songKey, tried)
		// 简单限长：只保留最近 100 首的尝试记录
		if (altTriedMap.size > 100) {
			const firstKey = altTriedMap.keys().next().value
			if (firstKey && firstKey !== songKey) altTriedMap.delete(firstKey)
		}
	}
	// 当前正在播的换源目标也算「已试过」：
	// 否则第一次会原样重试同一个地址（resolveSource 里已经换过一次源的情况）
	try {
		const { resolvedFromStore } = await import('@/player/PlayerStore')
		const cur: any = resolvedFromStore.getValue()
		if (cur?.to && cur?.toId && String(cur.title ?? '') === String(musicItem?.title ?? '')) {
			tried.add(`${cur.to}:${cur.toId}`)
		}
	} catch { /* ignore */ }
	if (tried.size >= ALT_MAX_TRIES) {
		logInfo('[jk/play] 换源已达上限，停止', songKey, String(tried.size))
		return false
	}
	try {
		const { findPlayableAlt } = await import('@/player/MusicSourceResolver')
		const { getSetting } = await import('@/jk/settingsStore')
		const quality = String(getSetting('music.quality', '128k'))
		logInfo('[jk/play] 播放失败，尝试换源', songKey, 'tried=', tried.size)
		const alt: any = await findPlayableAlt(musicItem, quality, 'current', { exclude: tried })
		if (!alt?.url) {
			logInfo('[jk/play] 换源无可用结果', songKey)
			return false
		}
		tried.add(`${alt.source}:${alt.id}`)
		logInfo('[jk/play] 换源成功', `${musicItem?.platform} -> ${alt.source}`, String(alt.title ?? ''))
		// 换源后直接流式播放（不再下载）：起播失败会由看门狗再触发一次换源
		const playUrl = String(alt.url ?? '')
		if (!/^https?:/i.test(playUrl) && !playUrl.startsWith('file://')) {
			logError('[jk/play] 换源返回的地址不可用', playUrl.slice(0, 80))
			return false
		}
		showToast('提示', `该源无法播放，已用${alt.label ?? alt.source}播放`, 'info')
		void import('@/player/PlayerStore').then(m => m.resolvedFromStore.setValue({
			from: String(musicItem?.platform ?? ''),
			to: String(alt.source ?? ''),
			toId: String(alt.id ?? ''),
			title: String(musicItem?.title ?? ''),
		})).catch(() => undefined)
		setTrackSource({ ...(musicItem as any), url: playUrl } as any)
		ReactNativeTrackPlayer.play()
		return true
	} catch (err) {
		logError('[jk/play] 换源异常', String((err as any)?.message ?? err))
		return false
	}
}

async function failToPlay() {
	// 每次进入失败恢复都计一次；连续 3 次由 skipToNext 的硬保护拦下
	notePlaybackFailure('failToPlay')
	const revision = controlRevision
	const failedMusic = currentMusicStore.getValue()
	const sourceToken = trackSourceLoadingStore.getValue()
	retireTrackSkip()
	if (isCurrentNativeItem(ReactNativeTrackPlayer.getActiveMediaItem())) {
		// Keep the failed item/headers so a native Play during the delay can reload
		// it immediately. That explicit intent also invalidates the delayed Next.
		ReactNativeTrackPlayer.stop()
	} else {
		nativeQueue = null
		ReactNativeTrackPlayer.clear()
	}
	await delay(500)
	if (revision !== controlRevision || !isCurrentMusic(failedMusic) ||
		sourceToken !== trackSourceLoadingStore.getValue() ||
		playbackIntentStore.getValue() !== 'play') return
	// 默认不自动跳歌（对齐 mac）：只有用户显式开启 player.autoSkipOnError 才跳
	let autoSkip = false
	try {
		const { getSetting } = await import('@/jk/settingsStore')
		autoSkip = getSetting<boolean>('player.autoSkipOnError', false) === true
	} catch { /* 默认 false */ }
	if (!autoSkip) {
		// 先尝试换平台（取流成功但播放失败时，原逻辑只会停住等用户手动换源）
		if (await tryAltSource(failedMusic)) return
		logInfo('[jk/play] autoSkipOnError=false，停在当前曲目（可点播放重试）')
		await haltWithNotice('播放失败，点击播放重试')
		return
	}
	await skipToNext()
}

// 播放模式相关
const _toggleRepeatMapping = {
	[MusicRepeatMode.SHUFFLE]: MusicRepeatMode.SINGLE,
	[MusicRepeatMode.SINGLE]: MusicRepeatMode.QUEUE,
	[MusicRepeatMode.QUEUE]: MusicRepeatMode.SHUFFLE,
}
/** 切换下一个模式 */
const toggleRepeatMode = () => {
	setRepeatMode(_toggleRepeatMapping[repeatModeStore.getValue()])
}

/**
 * 添加到播放列表
 * @param musicItems 目标歌曲
 * @param beforeIndex 在第x首歌曲前添加
 * @param shouldShuffle 随机排序
 */
const addAll = (
	musicItems: Array<IMusic.IMusicItem> = [],
	beforeIndex?: number,
	shouldShuffle?: boolean,
) => {
	const now = Date.now()
	let newPlayList: IMusic.IMusicItem[] = []
	const currentPlayList = getPlayList()
	const _musicItems = musicItems.map((item, index) => ({
		...item,
		[timeStampSymbol]: now,
		[sortIndexSymbol]: index,
	}))
	if (beforeIndex === undefined || beforeIndex < 0) {
		newPlayList = currentPlayList.concat(_musicItems.filter((item) => !isInPlayList(item)))
	} else {
		const indexMap = createMediaIndexMap(_musicItems)
		const beforeDraft = currentPlayList.slice(0, beforeIndex).filter((item) => !indexMap.has(item))
		const afterDraft = currentPlayList.slice(beforeIndex).filter((item) => !indexMap.has(item))

		newPlayList = [...beforeDraft, ..._musicItems, ...afterDraft]
	}

	if (shouldShuffle) {
		newPlayList = shuffle(newPlayList)
	}
	setPlayList(newPlayList)
	const currentMusicItem = currentMusicStore.getValue()

	if (currentMusicItem) {
		currentIndex = getMusicIndex(currentMusicItem)
	}
	updateNextMetadata()
}

/** 追加到队尾 */
const add = (musicItem: IMusic.IMusicItem | IMusic.IMusicItem[], beforeIndex?: number) => {
	addAll(Array.isArray(musicItem) ? musicItem : [musicItem], beforeIndex)
}

/**
 * 下一首播放
 * @param musicItem
 */
const addAsNextTrack = (musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]) => {
	const shouldPlay = isPlayListEmpty()
	add(musicItem, currentIndex + 1)
	if (shouldPlay) {
		play(Array.isArray(musicItem) ? musicItem[0] : musicItem)
	}
}
/**
 * 是当前正在播放的音频
 *
 */
const isCurrentMusic = (musicItem: IMusic.IMusicItem | null | undefined) => {
	return isSameMediaItem(musicItem, currentMusicStore.getValue()) ?? false
}
/**
 * 从播放列表移除IMusicItem
 *
 */
const remove = async (musicItem: IMusic.IMusicItem) => {
	const playList = getPlayList()
	let newPlayList: IMusic.IMusicItem[] = []
	let currentMusic: IMusic.IMusicItem | null = currentMusicStore.getValue()
	const targetIndex = getMusicIndex(musicItem)
	let shouldPlayCurrent: boolean | null = null
	if (targetIndex === -1) {
		// 1. 这种情况应该是出错了
		return
	}
	// 2. 移除的是当前项
	if (currentIndex === targetIndex) {
		// 2.1 停止播放，移除当前项
		newPlayList = produce(playList, (draft) => {
			draft.splice(targetIndex, 1)
		})
		// 2.2 设置新的播放列表，并更新当前音乐
		if (newPlayList.length === 0) {
			currentMusic = null
			shouldPlayCurrent = false
		} else {
			currentMusic = newPlayList[currentIndex % newPlayList.length]
			// Native route loss/interruption can pause output without a remote event.
			// Intent only stands in for output while the requested source is pending.
			shouldPlayCurrent = ReactNativeTrackPlayer.isPlaying() ||
				(playbackIntentStore.getValue() === 'play' &&
					(trackSourceLoadingStore.getValue() !== null ||
						ReactNativeTrackPlayer.getPlaybackState() === PlaybackState.Buffering))
		}
	} else {
		// 3. 删除
		newPlayList = produce(playList, (draft) => {
			draft.splice(targetIndex, 1)
		})
	}

	setPlayList(newPlayList)
	setCurrentMusic(currentMusic)
	if (shouldPlayCurrent === true) {
		await play(currentMusic, true)
	} else if (shouldPlayCurrent === false) {
		reset()
	} else {
		updateNextMetadata()
	}
}

function updateNextMetadata() {
	if (!nativeQueue || ReactNativeTrackPlayer.getQueue().length < 2) return
	const next = getFakeNextTrack()
	ReactNativeTrackPlayer.updateMetadata(1, {
		title: next.title ?? '',
		artist: next.artist ?? '',
		albumTitle: next.album ?? '',
		artworkUrl: next.artwork?.trim() || '',
	})
}

/**
 * 设置播放模式
 * @param mode 播放模式
 */
const setRepeatMode = (mode: MusicRepeatMode) => {
	const playList = getPlayList()
	let newPlayList
	const prevMode = repeatModeStore.getValue()

	if (
		(prevMode === MusicRepeatMode.SHUFFLE && mode !== MusicRepeatMode.SHUFFLE) ||
		(mode === MusicRepeatMode.SHUFFLE && prevMode !== MusicRepeatMode.SHUFFLE)
	) {
		if (mode === MusicRepeatMode.SHUFFLE) {
			newPlayList = shuffle(playList)
		} else {
			newPlayList = sortByTimestampAndIndex(playList, true)
		}
		setPlayList(newPlayList)
	}

	const currentMusicItem = currentMusicStore.getValue()
	currentIndex = getMusicIndex(currentMusicItem)
	repeatModeStore.setValue(mode)
	// 更新下一首歌的信息
	updateNextMetadata()
	// 记录
	PersistStatus.set('music.repeatMode', mode)
}

/** 清空播放列表 */
const clear = async () => {
	setPlayList([])
	setCurrentMusic(null)

	reset()
	PersistStatus.set('music.musicItem', undefined)
	PersistStatus.set('music.progress', 0)
}
/** 清空待播列表 */
const clearToBePlayed = async () => {
	// 获取当前正在播放的音乐
	const currentMusic = currentMusicStore.getValue()

	if (currentMusic) {
		// 设置播放列表仅包含当前正在播放的音乐
		setPlayList([currentMusic])
		setCurrentMusic(currentMusic)

		updateNextMetadata()
	} else {
		// 如果没有当前播放的音乐，清空播放列表
		setPlayList([])
		setCurrentMusic(null)
		reset()
	}
}

/** 暂停 */
const pause = () => {
	setPlaybackIntent('pause')
	persistCurrentProgress()
	ReactNativeTrackPlayer.pause()
}

const stop = () => {
	setPlaybackIntent('stop')
	ReactNativeTrackPlayer.stop()
}

/** 设置音源 */
const setTrackSource = (track: Track) => {
	currentIndex = getMusicIndex(track as IMusic.IMusicItem)
	const token = createTrackSourceLoadingToken(track as IMusic.IMusicItem)
	// Snapshot after source resolution. A preference change never reloads the active item.
	// 默认开启精确 seek：false 时 RNTP 会跳到最近关键帧，音频实际落点与目标差 1-2 秒，
	// 而歌词按目标时间走 → 拖完进度后必然偏移（偏移量随关键帧间隔变化，所以「每次不一样」）
	const playbackOptions = { preciseSeeking: PersistStatus.get('music.preciseSeeking') !== false }
	const items = [
		toMediaItem(track, token, false, playbackOptions),
		toMediaItem(getFakeNextTrack(), token, true),
	]
	// Keep the complete resolved source in JS. v5 getter projections lose headers.
	nativeQueue = { token, track, startedAt: Date.now(), handoffConsumed: false }
	// 对照实验用：把最终交给 RNTP 的 url 完整打出来（判断是 file:// 还是 https）
	try {
		logInfo('[jk/play] item0 =', JSON.stringify(items[0]).slice(0, 800))
		logInfo('[jk/play] item1 =', JSON.stringify(items[1]).slice(0, 300))
	} catch (e) {
		logInfo('[jk/play] item stringify failed', String((e as any)?.message ?? e))
	}
	ReactNativeTrackPlayer.setMediaItems(items)
	// 新地址/新曲目：重置片段与停滞计时
	resetStreamGuards()
	setCurrentMusic(track as IMusic.IMusicItem)
	PersistStatus.set('music.musicItem', track as IMusic.IMusicItem)
	PersistStatus.set('music.progress', 0)

	const intent = playbackIntentStore.getValue()
	if (intent === 'play') {
		ReactNativeTrackPlayer.play()
	} else if (intent === 'stop') {
		// A source may finish resolving after Stop. Retain it for a later Play,
		// without letting setMediaItems change the requested stopped state.
		ReactNativeTrackPlayer.stop()
	}

	// 只有「要播放」时才监控：12 秒内没进入 Playing / 进度不动 → 按失败处理
	clearPlayWatchdog()
	if (intent === 'play') {
		playWatchdogTimer = setTimeout(() => {
			playWatchdogTimer = null
			void (async() => {
				try {
					// 注意：这里不能比 trackSourceLoadingStore —— 它在 play() 的 finally
					// 里已被清成 null，而 token 是 setTrackSource 新生成的，永远不相等，
					// 结果是看门狗从不生效（0:00 卡死的根因）。
					// 正确做法是比 nativeQueue.token：换曲/换源后它会被替换。
					if (nativeQueue?.token !== token) return
					if (!isCurrentMusic(track as IMusic.IMusicItem)) return
					if (playbackIntentStore.getValue() !== 'play') return
					const progress: any = ReactNativeTrackPlayer.getProgress?.() ?? {}
					const position = Number(progress?.position ?? 0)
					const duration = Number(progress?.duration ?? 0)
					const state = ReactNativeTrackPlayer.getPlaybackState?.()
					// RNTP 的枚举没有 Playing（idle/ready/buffering/ended/error），
					// 用「进度是否真的在走」判断更可靠
					const ready = position > 0.5
					if (ready) return
					logError('[jk/play] 看门狗超时：8s 未就绪 position=', String(position), 'duration=', String(duration), 'state=', String(state))
					await failToPlay()
				} catch { /* ignore */ }
			})()
		}, 8000)
	}
}
/**
 * 设置currentMusicStore，更新currentIndex
 *
 */
const setCurrentMusic = (musicItem?: IMusic.IMusicItem | null) => {
	if (!musicItem) {
		currentIndex = -1
		currentMusicStore.setValue(null)
		trackSourceLoadingStore.setValue(null)
		PersistStatus.set('music.musicItem', undefined)
		PersistStatus.set('music.progress', 0)
		return
	}
	currentIndex = getMusicIndex(musicItem)
	currentMusicStore.setValue(musicItem)
}

const setQuality = (quality: IMusic.IQualityKey) => {
	qualityStore.setValue(quality)
	setSetting('music.quality', quality)
	PersistStatus.set('music.quality', quality)
}
//添加歌曲到指定歌单
const addSongToStoredPlayList = (playlist: IMusic.PlayList, track: IMusic.IMusicItem) => {
	try {
		const nowPlayLists = playListsStore.getValue() || []
		const updatedPlayLists = nowPlayLists.map((existingPlaylist) => {
			if (existingPlaylist.id === playlist.id) {
				// 检查歌曲是否已经存在于播放列表中
				// console.log('track', JSON.stringify(track))
				// console.log('existingPlaylist.songs', JSON.stringify(existingPlaylist.songs))
				const songExists = existingPlaylist.songs.some((song) => song.id == track.id)
				// console.log('songExists', songExists)

				if (!songExists) {
					// 只有当歌曲不存在时才添加；插入位置跟随「添加音乐位置」设置
					const addPos = getSetting<'top' | 'bottom'>('list.addMusicLocationType', 'top')
					return {
						...existingPlaylist,
						songs: addPos === 'bottom'
							? [...existingPlaylist.songs, track]
							: [track, ...existingPlaylist.songs],
					}
				} else {
					logInfo('歌曲已存在')
				}
			}
			return existingPlaylist
		})

		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)
		logInfo('歌曲成功添加到歌单')
	} catch (error) {
		logError('添加歌曲到歌单时出错:', error)
		// 可以在这里添加一些错误处理逻辑，比如显示一个错误提示给用户
	}
}
//从歌单删除指定歌曲
//添加歌曲到指定歌单
const deleteSongFromStoredPlayList = (playlist: IMusic.PlayList, trackId: string) => {
	try {
		const nowPlayLists = playListsStore.getValue() || []
		const updatedPlayLists = nowPlayLists.map((existingPlaylist) => {
			if (existingPlaylist.id === playlist.id) {
				// 检查歌曲是否已经存在于播放列表中
				const songExists = existingPlaylist.songs.some((song) => song.id == trackId)

				if (songExists) {
					// 只有当歌曲存在时才删除
					return {
						...existingPlaylist,
						songs: existingPlaylist.songs.filter((song) => song.id !== trackId),
					}
				} else {
					logInfo('歌曲不存在')
				}
			}
			return existingPlaylist
		})

		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)
		logInfo('歌曲成功删除')
	} catch (error) {
		logError('删除歌曲到歌单时出错:', error)
		// 可以在这里添加一些错误处理逻辑，比如显示一个错误提示给用户
	}
}
const addPlayLists = (playlist: IMusic.PlayList) => {
	try {
		const nowPlayLists = playListsStore.getValue() || []

		// 检查播放列表是否已存在
		const playlistExists = nowPlayLists.some(
			(existingPlaylist) => existingPlaylist.id == playlist.id,
		)

		if (playlistExists) {
			// logInfo(`Playlist already exists, not adding duplicate. Current playlists: ${JSON.stringify(nowPlayLists, null, 2)}`);
			return // 如果播放列表已存在，直接返回，不进行任何操作
		}

		// 如果播放列表不存在，则添加它
		const updatedPlayLists = [...nowPlayLists, playlist]
		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)
		logInfo('Playlist added successfully')
	} catch (error) {
		logError('Error adding playlist:', error)
		// 可以在这里添加一些错误处理逻辑，比如显示一个错误提示给用户
	}
}
const deletePlayLists = (playlistId: string) => {
	try {
		if (playlistId == 'favorites') {
			return '不能删除收藏歌单'
		}
		const nowPlayLists = playListsStore.getValue() || []

		// 检查播放列表是否已存在
		const playlistFiltered = nowPlayLists.filter(
			(existingPlaylist) => existingPlaylist.id !== playlistId,
		)

		// 如果播放列表不存在，则添加它
		const updatedPlayLists = [...playlistFiltered]
		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)
		logInfo('Playlist deleted successfully')
		return 'success'
	} catch (error) {
		logError('Error deleted playlist:', error)
	}
}
const getPlayListById = (playlistId: string) => {
	try {
		// logInfo(playlistId + 'playlistId')
		const nowPlayLists = playListsStore.getValue() || []
		const playlistFiltered = nowPlayLists.filter(
			(existingPlaylist) => existingPlaylist.id === playlistId,
		)
		return playlistFiltered
	} catch (error) {
		logError('Error find playlist:', error)
	}
}
const addMusicApi = (musicApi: IMusic.MusicApi) => {
	try {
		const nowMusicApiList = musicApiStore.getValue() || []

		// 检查是否已存在
		const existingApiIndex = nowMusicApiList.findIndex(
			(existingApi) => existingApi.id === musicApi.id,
		)

		if (existingApiIndex !== -1) {
			Alert.alert('是否覆盖', `已经存在该音源，是否覆盖？`, [
				{
					text: '确定',
					onPress: () => {
						const updatedMusicApiList = [...nowMusicApiList]
						// 保留原有的 isSelected 状态
						updatedMusicApiList[existingApiIndex] = {
							...musicApi,
							isSelected: updatedMusicApiList[existingApiIndex].isSelected,
						}
						musicApiStore.setValue(updatedMusicApiList)
						PersistStatus.set('music.musicApi', updatedMusicApiList)
						logInfo('Music API updated successfully')
						Alert.alert('成功', '音源更新成功', [
							{ text: '确定', onPress: () => logInfo('Update alert closed') },
						])
					},
				},
				{ text: '取消', onPress: () => {}, style: 'cancel' },
			])
		} else {
			// 如果是新添加的音源，默认设置 isSelected 为 false 。如果音源为空，则自动选择
			const newMusicApi = musicApi
			console.log('nowMusicApiList', nowMusicApiList)
			const updatedMusicApiList = [...nowMusicApiList, newMusicApi]
			if (!nowMusicApiList.length) {
				logInfo('音源为空，自动选择')
				musicApiStore.setValue(updatedMusicApiList)
				PersistStatus.set('music.musicApi', updatedMusicApiList)
				setMusicApiAsSelectedById(newMusicApi.id)
			} else {
				musicApiStore.setValue(updatedMusicApiList)
				PersistStatus.set('music.musicApi', updatedMusicApiList)
			}
			logInfo('音源导入成功')
			Alert.alert('成功', '音源导入成功', [
				{ text: '确定', onPress: () => logInfo('Add alert closed') },
			])
		}
	} catch (error) {
		logError('Error adding/updating music API:', error)
		Alert.alert('失败', '音源导入/更新失败', [
			{ text: '确定', onPress: () => logInfo('Error alert closed') },
		])
	}
}
/** 把完整歌曲对象摊平成脚本能读的字段（各脚本字段名不同：hash/FileHash/SQFileHash/rid/copyrightId） */
const flattenMusicForScript = (item: any, fallback: Record<string, any>) => {
	const jk = item?.lxMusic
	const meta = jk?.meta ?? item?.meta ?? {}
	return {
		...(meta ?? {}),
		...(jk ?? {}),
		...fallback,
	}
}

/** 主脚本的 getMusicUrl 换成「池化取流」，所有调用方自动获得多源级联 */
const withPooledUrl = (api: any) => {
	if (!api) return api
	return {
		...api,
		// 标记：这是对外包装层，不能进入候选池（否则池化会调用自己 → 无限递归）
		__pooled: true,
		__originId: api.id,
		getMusicUrl: (
			title: string,
			artist: string,
			songmid: string,
			quality: string,
			_ctx?: any,
			source?: string,
			item?: any,
		) => getPooledMusicUrl(
			title,
			artist,
			songmid,
			quality,
			String(source ?? api?.platform ?? 'tx'),
			flattenMusicForScript(item, { songmid, id: songmid, name: title, singer: artist, source }),
		),
	}
}

/**
 * 预热脚本池：把所有已导入脚本都加载到各自 runtime，
 * 再按平台构建候选链。加载失败不影响主脚本可用。
 */
const applySourcePool = async (selectedApi: any) => {
	const all: IMusic.MusicApi[] = (musicApiStore.getValue() || []) as any
	const loaded: any[] = []
	for (const api of all) {
		try {
			if (api?.scriptType === 'lxmusic' || isLxMusicScript(api?.script)) {
				loaded.push(await reloadLxMusicScript(api))
			} else if (api?.getMusicUrl) {
				loaded.push(api)
			}
		} catch (error) {
			logError(`[jk/source] 池化加载失败 ${String(api?.name ?? '')}:`, error)
		}
	}
	let primary = loaded.find(api => api.id === selectedApi?.id)
	if (!primary && selectedApi?.getMusicUrl) {
		primary = selectedApi
		loaded.unshift(selectedApi)
	}
	const ordered = primary ? [primary, ...loaded.filter(api => api.id !== primary?.id)] : loaded
	if (ordered.length) setSourcePool(ordered)
	return primary ?? selectedApi
}

const reloadNowSelectedMusicApi = async () => {
	try {
		// 获取当前存储的所有音源脚本
		const musicApis = musicApiStore.getValue() || []

		// 找到被选中的音源脚本
		const selectedApi = musicApiSelectedStore.getValue()

		if (selectedApi === null) {
			logInfo('No music API is currently selected.')
			return null
		}
		// 重新加载选中的脚本，并把全部已导入脚本预热成候选池
		const reloadedApi = await reloadMusicApi(selectedApi)
		const primary = await applySourcePool(reloadedApi)
		const pooledApi = withPooledUrl(primary)

		// 更新 musicApiStore 中的脚本
		musicApiSelectedStore.setValue(pooledApi)
		bindMusicApi(pooledApi)

		// 更新 store 和持久化存储
		PersistStatus.set('music.selectedMusicApi', pooledApi)

		logInfo(`Selected music API "${pooledApi?.name}" reloaded successfully`)

		return pooledApi
	} catch (error) {
		logError('Error reloading selected music API:', error)
		throw error
	}
}
const reloadMusicApi = async (musicApi: IMusic.MusicApi, isTest: boolean = false): Promise<IMusic.MusicApi> => {
	if (!musicApi.isSelected && !isTest) {
		return musicApi // 如果没有被选中，直接返回原始对象
	}

	try {
		// 检测是否为 lx-music 格式脚本
		if (musicApi.scriptType === 'lxmusic' || isLxMusicScript(musicApi.script)) {
			return await reloadLxMusicScript(musicApi)
		}

		// Cymusic 原有 CommonJS 格式
		const context: any = {
			module: { exports: {} },
			exports: {},
			require: () => {},
		}

		const scriptFunction = new Function('module', 'exports', 'require', musicApi.script)
		scriptFunction.call(context, context.module, context.exports, context.require)
		if (!isTest) disposeLxMusicScript()

		return {
			...musicApi,
			getMusicUrl: context.module.exports.getMusicUrl || musicApi.getMusicUrl,
		}
	} catch (error) {
		logError(`Error reloading script for API "${musicApi.name}":`, error)
		return musicApi
	}
}
const setMusicApiAsSelectedById = async (musicApiId: string) => {
	try {
		// 获取当前存储的所有音源脚本
		let musicApis: IMusic.MusicApi[] = musicApiStore.getValue() || []

		// 检查指定的音源是否存在
		const targetApiIndex = musicApis.findIndex((api) => api.id === musicApiId)

		if (targetApiIndex === -1) {
			logError(`Music API with id ${musicApiId} not found`)
			Alert.alert('错误', '未找到指定的音源')
			return
		}

		// 更新选中状态
		musicApis = musicApis.map((api) => ({
			...api,
			isSelected: api.id === musicApiId,
		}))

		// 获取新选中的音源
		const selectedApi = musicApis[targetApiIndex]

		// 重新加载选中的音源脚本，并把全部已导入脚本预热成候选池
		const reloadedApi = await reloadMusicApi(selectedApi)
		const primary = await applySourcePool(reloadedApi)
		const pooledApi = withPooledUrl(primary)

		// 更新重新加载后的音源
		musicApiSelectedStore.setValue(pooledApi)
		bindMusicApi(pooledApi)
		// 更新 store 和持久化存储
		PersistStatus.set('music.selectedMusicApi', pooledApi)

		logInfo(`Music API "${pooledApi?.name}" set as selected and reloaded successfully`)
		// 改成非模态提示：Alert 会挡住后续所有截图与自动化操作
		showToast('音源已切换', `${pooledApi?.name} 已设为当前音源`, 'success')
	} catch (error) {
		logError('Error setting music API as selected:', error)
		showToast('音源切换失败', String((error as any)?.message ?? error).slice(0, 80), 'error')
	}
}

const deleteMusicApiById = (musicApiId: string) => {
	const selectedMusicApi = musicApiSelectedStore.getValue()
	const musicApis = musicApiStore.getValue() || []
	if (selectedMusicApi?.id === musicApiId) {
		musicApiSelectedStore.setValue(null)
		bindMusicApi(null)
	}
	const musicApisFiltered = musicApis.filter((musicApi) => musicApi.id !== musicApiId)
	musicApiStore.setValue(musicApisFiltered)
	setSourcePool(musicApisFiltered.filter(api => Array.isArray((api as any).supportedSources) && (api as any).supportedSources.length))
	PersistStatus.set('music.musicApi', musicApisFiltered)
	logInfo('Music API deleted successfully')
	Alert.alert('成功', '音源删除成功', [
		{ text: '确定', onPress: () => logInfo('Add alert closed') },
	])
}
const play = async (musicItem?: IMusic.IMusicItem | null, forcePlay?: boolean, skipOperation?: symbol) => {
	let trackSourceLoadingToken: string | null = null
	try {
		// A direct selection supersedes an older Next/Previous request. Its late
		// finally must not clear a newer navigation operation with the same direction.
		if (skipOperation !== activeTrackSkip) retireTrackSkip()
		if (!musicItem) {
			musicItem = currentMusicStore.getValue()
		}
		if (!musicItem) {
			throw new Error(PlayFailReason.PLAY_LIST_IS_EMPTY)
		}
		// 用户/自动切歌进入新的一次播放：重置该曲的换源记录，
		// 让「播放失败，点击播放重试」能重新走一遍所有平台
		resetAltTried(musicItem)
		setPlaybackIntent('play')

		// 1. If already playing this track
		if (isCurrentMusic(musicItem)) {
			// Resume an outstanding request without starting another one. Its result
			// reads the latest intent; explicit replacement still gets a new token.
			if (trackSourceLoadingStore.getValue() !== null && !forcePlay) return
			const firstItem = ReactNativeTrackPlayer.getQueue()[0]
			if (nativeQueue && getNativeTrackIdentity(firstItem)?.token === nativeQueue.token &&
				isSameMediaItem(musicItem, nativeQueue.track as IMusic.IMusicItem)) {
				trackSourceLoadingStore.setValue(null)
				// 本地文件（下载页试听）带的 url 必须优先：nativeQueue.track 可能是上一次
				// 在线取流的结果，没有 url，直接复用会变成 fake-audio
				const incomingUrl = String((musicItem as any)?.url ?? '')
				const queuedUrl = String((nativeQueue.track as any)?.url ?? '')
				if (incomingUrl.startsWith('file://') && incomingUrl !== queuedUrl) {
					setTrackSource(musicItem as any)
					return
				}
				if (forcePlay || ReactNativeTrackPlayer.getActiveMediaItemIndex() !== 0 ||
					ReactNativeTrackPlayer.getPlaybackState() === PlaybackState.Error) {
					// A fresh transport token also retires already-queued placeholder events.
					setTrackSource(nativeQueue.track)
				} else {
					// In v5, Play reloads a stopped retained item from zero, including headers.
					ReactNativeTrackPlayer.play()
				}
				return
			}
		}

		// 2. Add to playlist if not present
		if (!isInPlayList(musicItem)) {
			add(musicItem)
		}

		trackSourceLoadingToken = createTrackSourceLoadingToken(musicItem)
		trackSourceLoadingStore.setValue(trackSourceLoadingToken)

		// 切歌前保存上一首的进度（保存播放进度开关开启时）
		persistCurrentProgress()

		// 3. Update current music state immediately (UI updates instantly)
		setCurrentMusic(musicItem)

		// 4. Resolve source (cache check + network if needed)
		const { url: sourceUrl, wasCached } = await resolveSource(musicItem, {
			requestType: 'current',
		})

		// 5. Race condition guard
		if (!isCurrentMusic(musicItem) || trackSourceLoadingStore.getValue() !== trackSourceLoadingToken) {
			return
		}

		// 6. Build track and set source
		const track = mergeProps(musicItem, {
			url: wasCached ? getCacheFileUri(sourceUrl) : sourceUrl,
		}) as IMusic.IMusicItem
		logInfo('获取音源成功：', track)
		setTrackSource(track)
		// 手动下载的歌曲：用 sidecar 封面（离线也有图）
		if (String((track as any).url ?? '').startsWith('file://') && String((track as any).url).includes('/downloads/')) {
			void import('@/jk/downloadStore').then(async m => {
				const side = await m.readSidecar(String((track as any).url))
				if (side.coverUri) {
					const { currentArtworkStore } = await import('@/jk/artworkStore')
					currentArtworkStore.setValue(side.coverUri)
				}
			}).catch(() => undefined)
		}
		const appliedToken = nativeQueue.token
		// 启动恢复：音源就绪后跳到上次播放位置（只应用一次）
		const restorePos = pendingRestorePositionStore.getValue()
		if (restorePos > 0) {
			pendingRestorePositionStore.setValue(0)
			const total = Number((track as any)?.duration ?? 0)
			if (!total || restorePos < total - 10) {
				setTimeout(() => {
					try {
						void (ReactNativeTrackPlayer as any).seekTo(restorePos)
						logInfo('[progress] seek restored', Math.round(restorePos))
					} catch { /* ignore */ }
				}, 400)
			}
		}

		// 7. Fetch lyrics in background (non-blocking)
		fetchLyric({ ...(musicItem as any), url: (track as any).url } as any)
			.then((lyc) => {
				// 歌词只跟「当前这首歌」绑定。原来的 nativeQueue.token 守卫在试听换源后
				// 会因为队列 token 变化而永远不写入，导致播放页一直「暂无歌词」。
				if (isCurrentMusic(musicItem)) {
					nowLyricState.setValue(lyc.lyric)
					nowLxLyricState.setValue(String((lyc as any).lxlyric ?? ''))
					nowTlyricState.setValue(String((lyc as any).tlyric ?? ''))
					// 写入后主动请求一次重建（链路 B），避免只等 progress 事件
					void LyricManager.requestRefresh?.()
				}
			})
			.catch((err) => logError('获取歌词失败:', err))

		// 8. Auto-cache in background
		if (
			sourceUrl !== fakeAudioMp3Uri &&
			!sourceUrl.includes('fake') &&
			!wasCached &&
			autoCacheLocalStore.getValue() &&
			!sourceUrl.startsWith('file://')
		) {
			setTimeout(() => {
				downloadToCache(track)
					.then((localUri) => {
						logInfo('音乐已缓存到本地:', localUri)
						const newTrack = { ...track, url: localUri }
						addImportedLocalMusic([newTrack], false)
					})
					.catch((error) => {
						logError('缓存音乐时出错:', error)
					})
			}, 5000)
		}

		// 9. 仅在当前曲目为远端音源时才预加载下一首，避免播放本地/缓存歌曲时继续发起音源请求
		const shouldPreloadNextTrack =
			sourceUrl !== fakeAudioMp3Uri &&
			!sourceUrl.includes('fake') &&
			!sourceUrl.startsWith('file://')
		const nextTrack = getPlayListMusicAt(currentIndex + 1)
		if (shouldPreloadNextTrack && nextTrack && !isSameMediaItem(nextTrack, musicItem)) {
			setTimeout(() => {
				preloadSource(nextTrack).catch(() => {})
			}, NEXT_TRACK_PRELOAD_DELAY_MS)
		}
	} catch (e: any) {
		if (trackSourceLoadingToken && trackSourceLoadingStore.getValue() !== trackSourceLoadingToken) return
		const message = e?.message
		if (message === PlayFailReason.FORBID_CELLUAR_NETWORK_PLAY) {
			logInfo('移动网络')
		} else if (message === PlayFailReason.INVALID_SOURCE || message === 'SOURCE_UNAVAILABLE') {
			// 取流/下载全部失败（所有平台 × 所有脚本都试过）：暂停并提示，不连跳
			logError('[jk/play] 所有平台均不可用:', message)
			await haltWithNotice()
		} else if (message === PlayFailReason.PLAY_LIST_IS_EMPTY) {
			// empty queue
		} else {
			logError('播放失败', e)
		}
	} finally {
		if (
			trackSourceLoadingToken &&
			trackSourceLoadingStore.getValue() === trackSourceLoadingToken
		) {
			trackSourceLoadingStore.setValue(null)
		}
	}
}
const cacheAndImportMusic = async (track: IMusic.IMusicItem) => {
	try {
		await ensureCacheDirExists()
		const localPath = getLocalFilePath(track)
		console.log('localPath:', localPath)
		const fileUri = getCacheFileUri(localPath)
		const isCacheExist = Paths.info(fileUri).exists
		if (isCacheExist) {
			logInfo('音乐已缓存到本地:', localPath)
			const newTrack = { ...track, url: localPath }
			await addImportedLocalMusic([newTrack], false)
		} else {
			logInfo('开始下载音乐:', track.url)
			await downloadFile(track.url, fileUri, (res) => {
				const progress = res.bytesWritten / res.contentLength
				logInfo(`下载进度: ${(progress * 100).toFixed(2)}%`)
			})
			logInfo('音乐已缓存到本地:', `${localPath}`)
			const newTrack = { ...track, url: `${localPath}` }
			await addImportedLocalMusic([newTrack], false)
		}

		Alert.alert('成功', '音乐已缓存到本地', [{ text: '确定', onPress: () => {} }])
	} catch (error) {
		logError('缓存音乐时出错:', error)
		// await addImportedLocalMusic([track], false)
	}
}

/**
 * 播放音乐，同时替换播放队列
 * @param musicItem 音乐
 * @param newPlayList 替代列表
 */
const playWithReplacePlayList = async (
	musicItem: IMusic.IMusicItem,
	newPlayList: IMusic.IMusicItem[],
) => {
	// 切歌/手动点歌 → 作废进行中的预取（世代递增）
	void import('@/player/prefetch').then(m => m.bumpPrefetchGeneration?.()).catch(() => undefined)
	// 用户主动点歌 = 一次新的尝试，清零连续失败计数
	notePlaybackSuccess()
	if (newPlayList.length !== 0) {
		const now = Date.now()
		const playListItems = newPlayList.map((item, index) => ({
			...item,
			[timeStampSymbol]: now,
			[sortIndexSymbol]: index,
		}))
		setPlayList(
			repeatModeStore.getValue() === MusicRepeatMode.SHUFFLE
				? shuffle(playListItems)
				: playListItems,
			true,
			true, // lazy index build - defer to first query
		)
		await play(musicItem, true)
	}
}

const runWithTrackSkipLoading = async (
	direction: 'next' | 'previous',
	action: (operation: symbol) => Promise<void>,
) => {
	if (activeTrackSkip) {
		return
	}

	const operation = Symbol(direction)
	activeTrackSkip = operation
	trackSkipLoadingStore.setValue(direction)
	try {
		await action(operation)
	} finally {
		if (activeTrackSkip === operation) {
			retireTrackSkip()
		}
	}
}

// 硬保护：连续播放失败 3 次就停止自动跳转（不受 autoSkipOnError 设置影响），
// 否则一次失败会连锁跳几十首并把每首都下载完（实测两分钟 160MB）
let consecutiveFailures = 0

export const notePlaybackFailure = (reason?: any) => {
	consecutiveFailures++
	logError(`[jk/play] consecutive failures=${consecutiveFailures}`, reason)
	return consecutiveFailures
}

export const notePlaybackSuccess = () => {
	consecutiveFailures = 0
}

const skipToNext = async () => {
	if (consecutiveFailures >= 3) {
		logError('[jk/play] consecutive failures=3, stop auto skip')
		showToast('播放连续失败，已暂停', '请检查音源或网络', 'error')
		try { await ReactNativeTrackPlayer.pause() } catch { /* ignore */ }
		return
	}
	await runWithTrackSkipLoading('next', async (operation) => {
		if (isPlayListEmpty()) {
			setCurrentMusic(null)
			reset()
			return
		}
		await play(getPlayListMusicAt(currentIndex + 1), true, operation)
	})
}

const skipToPrevious = async () => {
	await runWithTrackSkipLoading('previous', async (operation) => {
		if (isPlayListEmpty()) {
			setCurrentMusic(null)
			reset()
			return
		}

		await play(getPlayListMusicAt(currentIndex === -1 ? 0 : currentIndex - 1), true, operation)
	})
}

/** 修改当前播放的音质 */
const changeQuality = async (newQuality: IMusic.IQualityKey) => {
	// 获取当前的音乐和进度
	if (newQuality === qualityStore.getValue()) {
		return true
	}

	// 获取当前歌曲
	const musicItem = currentMusicStore.getValue()
	if (!musicItem) {
		return false
	}
	try {
		setQuality(newQuality)
		return true
	} catch {
		// 修改失败
		return false
	}
}

enum PlayFailReason {
	/** 禁止移动网络播放 */
	FORBID_CELLUAR_NETWORK_PLAY = 'FORBID_CELLUAR_NETWORK_PLAY',
	/** 播放列表为空 */
	PLAY_LIST_IS_EMPTY = 'PLAY_LIST_IS_EMPTY',
	/** 无效源 */
	INVALID_SOURCE = 'INVALID_SOURCE',
	/** 非当前音乐 */
}

function useMusicState() {
	return usePlaybackState()
}

const emptyProgress = { position: 0, duration: 0, buffered: 0, cached: 0 }

function getProgress() {
	return isCurrentNativeItem(ReactNativeTrackPlayer.getActiveMediaItem())
		? ReactNativeTrackPlayer.getProgress()
		: emptyProgress
}

function useMusicProgress(intervalSeconds = 1) {
	// v5 polls drive renders but retain the previous track's sample between ticks.
	// Read the current native snapshot so a new selection cannot borrow its duration.
	useProgress(intervalSeconds)
	currentMusicStore.useValue()
	return getProgress()
}

function getPreviousMusic() {
	const currentMusicItem = currentMusicStore.getValue()
	if (!currentMusicItem) {
		return null
	}

	return getPlayListMusicAt(currentIndex - 1)
}

function getNextMusic() {
	const currentMusicItem = currentMusicStore.getValue()
	if (!currentMusicItem) {
		return null
	}

	return getPlayListMusicAt(currentIndex + 1)
}
const addImportedLocalMusic = async (musicItem: IMusic.IMusicItem[], isAlert: boolean = true) => {
	try {
		console.log('addImportedLocalMusic', musicItem[0])
		const importedLocalMusic = importedLocalMusicStore.getValue() || []
		const newMusicItems = musicItem.filter(
			(newItem) => !importedLocalMusic.some((existingItem) => existingItem.id == newItem.id),
		)
		if (newMusicItems.length === 0) {
			// Alert.alert('提示', '所有选择的音乐已经存在，没有新的音乐被导入。')
			return
		}
		// 确保目标目录存在 isAlert只有导入本地音乐为true。所有自动缓存为false.,不需要移动文件
		if (isAlert) {
			const targetDir = `${FileSystemNative.documentDirectoryPath}/importedLocalMusic`
			await ensureDirExists(targetDir)

			// 移动文件并更新musicItem的url
			for (const item of newMusicItems) {
				if (item.url.startsWith('file://')) {
					const originalExtension = item.url.split('.').pop() || 'mp3'

					// 创建一个安全的文件名（移除或替换不允许的字符）
					const safeTitle = item.title.replace(/[/\\?%*:|"<>]/g, '-')
					const safeArtist = item.artist.replace(/[/\\?%*:|"<>]/g, '-')
					const fileName = `${safeTitle}-${safeArtist}.${originalExtension}`
					const newPath = `${targetDir}/${fileName}`
					await FileSystem.moveAsync({
						from: item.url,
						to: newPath,
					})
					item.url = newPath
				}
			}
		}
		const updatedImportedLocalMusic = [...importedLocalMusic, ...newMusicItems]
		importedLocalMusicStore.setValue(updatedImportedLocalMusic)
		PersistStatus.set('music.importedLocalMusic', updatedImportedLocalMusic)
		if (isAlert) {
			Alert.alert('成功', '音乐导入成功,请手动选择', [
				{ text: '确定', onPress: () => logInfo('Add alert closed') },
			])
		}
	} catch (error) {
		logError('本地音乐保存时出错:', error)
	}
}
const deleteImportedLocalMusic = async (musicItemsIdToDelete: string) => {
	try {
		const importedLocalMusic = importedLocalMusicStore.getValue() || []
		const selectedItems = importedLocalMusic.filter((item) => item.id === musicItemsIdToDelete)
		if (selectedItems.length !== 1) return
		const selectedItem = selectedItems[0]
		const localFile = await resolveLocalFile(selectedItem.url, { requireOwnedMedia: true })
		const currentItems = importedLocalMusicStore.getValue() || []
		if (
			!currentItems.includes(selectedItem) ||
			currentItems.filter((item) => item.id === musicItemsIdToDelete).length !== 1
		) {
			return
		}
		if (localFile.status === 'resolved') {
			await FileSystem.deleteAsync(localFile.fileUri)
		}
		// Explicit removal may discard a missing-file record, but never guesses a file
		// target. Read the latest list after I/O so concurrent imports/deletes survive.
		const latestItems = importedLocalMusicStore.getValue() || []
		const updatedImportedLocalMusic = latestItems.filter((item) => item !== selectedItem)
		importedLocalMusicStore.setValue(updatedImportedLocalMusic)
		PersistStatus.set('music.importedLocalMusic', updatedImportedLocalMusic)
	} catch (error) {
		logError('删除本地音乐时出错:', error)
	}
}
const isExistImportedLocalMusic = (musicItemName: string) => {
	// todo 检查文件存在？
	const importedLocalMusic = importedLocalMusicStore.getValue() || []
	return importedLocalMusic.some((item) => item.genre === musicItemName)
}
const toggleAutoCacheLocal = (bool: boolean) => {
	PersistStatus.set('music.autoCacheLocal', bool)
	autoCacheLocalStore.setValue(bool)
}
const toggleIsCachedIconVisible = (bool: boolean) => {
	PersistStatus.set('music.isCachedIconVisible', bool)
	isCachedIconVisibleStore.setValue(bool)
}
const showErrorMessage = (message: string) => {
	// 只在应用在前台时显示 Alert
	if (AppState.currentState === 'active') {
		showToast('错误', message, 'error')
		// Alert.alert('错误', message, [{ text: '确定', onPress: () => {} }])
	}
}
const myTrackPlayer = {
	setupTrackPlayer,
	usePlayList,
	getPlayList,
	addAll,
	add,
	addAsNextTrack,
	skipToNext,
	notePlaybackFailure,
	notePlaybackSuccess,
	skipToPrevious,
	play,
	playWithReplacePlayList,
	pause,
	stop,
	observeNativeTransport,
	remove,
	clear,
	clearToBePlayed,
	useCurrentMusic: currentMusicStore.useValue,
	getCurrentMusic: currentMusicStore.getValue,
	useRepeatMode: repeatModeStore.useValue,
	getRepeatMode: repeatModeStore.getValue,
	toggleRepeatMode,
	usePlaybackState,
	setRepeatMode,
	setQuality,
	getProgress,
	useProgress: useMusicProgress,
	seekTo: ReactNativeTrackPlayer.seekTo,
	isCurrentNativeItem,
	isCurrentProgressEvent,
	changeQuality,
	addPlayLists,
	deletePlayLists,
	getPlayListById,
	addMusicApi,
	setMusicApiAsSelectedById,
	deleteMusicApiById,
	addSongToStoredPlayList,
	deleteSongFromStoredPlayList,
	addImportedLocalMusic,
	deleteImportedLocalMusic,
	isExistImportedLocalMusic,
	useCurrentQuality: qualityStore.useValue,
	getCurrentQuality: qualityStore.getValue,
	getRate: ReactNativeTrackPlayer.getPlaybackSpeed,
	setRate: (rate: number) => {
		ReactNativeTrackPlayer.setPlaybackSpeed(rate)
		PersistStatus.set('music.rate', rate)
	},
	getVolume: ReactNativeTrackPlayer.getVolume,
	setVolume: (volume: number) => {
		const v = Number(volume)
		ReactNativeTrackPlayer.setVolume(Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1)
	},
	useMusicState,
	reset,
	getPreviousMusic,
	getNextMusic,
	clearCache,
	toggleAutoCacheLocal,
	cacheAndImportMusic,
	isCached,
	toggleIsCachedIconVisible,
	reloadMusicApi,
}

export default myTrackPlayer
export { MusicRepeatMode, PlaybackState as MusicState }
