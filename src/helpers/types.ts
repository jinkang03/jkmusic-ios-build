import type { Track } from '@/player/types'

export type Playlist = {
	name: string
	tracks: Track[]
	artworkPreview: string
	singerImg: string
	coverImg: string
	period: string
	title: string
	description: string
	artwork: string
	id: string
	/** 平台 */
	platform: string
	/** 作者 */
	artist: string
	songs: IMusic.IMusicItem[]
	/** 「我的列表」：有来源链接，支持「更新歌单」 */
	canUpdate?: boolean
	/** 「我的列表」：已设置自定义封面，菜单里显示「更换封面 / 恢复默认」 */
	hasCustomCover?: boolean
}

export type Artist = {
	name: string
	tracks: Track[]
	singerImg: string
}

export enum MusicRepeatMode {
	/** 随机播放 */
	SHUFFLE = 'SHUFFLE',
	/** 列表循环 */
	QUEUE = 'QUEUE',
	/** 单曲循环 */
	SINGLE = 'SINGLE',
}

export type TrackWithPlaylist = Track & { playlist?: string[]; platform?: string }
