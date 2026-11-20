import { MusicRepeatMode } from '@/helpers/types'
import { GlobalState } from '@/utils/stateMapper'

/** 当前播放 */
export const currentMusicStore = new GlobalState<IMusic.IMusicItem | null>(null)
/** 逐字歌词原文（与 nowLyricState 并列） */
export const nowLxLyricState = new GlobalState<string>('')
/** 待恢复的播放位置（秒）：启动恢复上次进度后，等音源就绪再 seek */
export const pendingRestorePositionStore = new GlobalState<number>(0)

/** 翻译歌词原文（与 nowLyricState 并列；设置里的「歌词翻译」开关读取它） */
export const nowTlyricState = new GlobalState<string>('')
/** 换源信息：实际播放的源与曲目源不同时用于 UI 提示 / 歌词按实际源请求 */
export const resolvedFromStore = new GlobalState<{ from: string, to: string, title: string, toId?: string } | null>(null)
/** 歌单 */
export const playListsStore = new GlobalState<IMusic.PlayList[] | []>(null)
/** 播放模式 */
export const repeatModeStore = new GlobalState<MusicRepeatMode>(MusicRepeatMode.QUEUE)
/** 音质 */
export const qualityStore = new GlobalState<IMusic.IQualityKey>('128k')
/** 音源 */
export const musicApiStore = new GlobalState<IMusic.MusicApi[] | []>(null)
/** 当前音源 */
export const musicApiSelectedStore = new GlobalState<IMusic.MusicApi>(null)
/** 音源状态 */
export const nowApiState = new GlobalState<string>('正常')
/** 是否自动缓存本地 */
export const autoCacheLocalStore = new GlobalState<boolean>(true)
/** 是否显示已缓存图标 */
export const isCachedIconVisibleStore = new GlobalState<boolean>(true)
/** 首页加载歌曲数量 */
export const songsNumsToLoadStore = new GlobalState<number>(100)
/** 已导入的本地音乐 */
export const importedLocalMusicStore = new GlobalState<IMusic.IMusicItem[] | []>(null)
/** 当前歌词 */
export const nowLyricState = new GlobalState<string>(null)
/** 切歌中的按钮方向 */
export const trackSkipLoadingStore = new GlobalState<'next' | 'previous' | null>(null)
/** 当前曲目音源解析中 */
export const trackSourceLoadingStore = new GlobalState<string | null>(null)

/** 缓冲（下载）进度：解析阶段就暴露给 UI，避免点歌后几秒「什么都没发生」 */
export const bufferingStore = new GlobalState<{ title?: string, percent?: number } | null>(null)
/** User transport intent; v5 readiness/output do not expose pending play intent. */
export const playbackIntentStore = new GlobalState<'play' | 'pause' | 'stop'>('pause')
