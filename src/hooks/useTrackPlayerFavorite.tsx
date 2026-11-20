/**
 * 播放页收藏：统一走 JKMUSIC 的列表模型（libraryStore.loveList），
 * 不再使用 Cymusic 的旧 favorites store（两套数据不通，点了「我的收藏」看不到）。
 */
import { useCallback } from 'react'
import { currentMusicStore } from '@/player/PlayerStore'
import { trackToJk } from '@/jk/adapt'
import { isInLoveList, libraryVersionStore, toggleLove } from '@/jk/libraryStore'

export const useTrackPlayerFavorite = () => {
	const activeTrack = currentMusicStore.useValue()
	// 订阅列表版本：收藏/取消后图标立即刷新
	libraryVersionStore.useValue()

	const jkMusic = activeTrack ? trackToJk(activeTrack as any) : null
	const isFavorite = !!jkMusic && isInLoveList(jkMusic)

	const toggleFavorite = useCallback(() => {
		if (jkMusic) toggleLove(jkMusic)
	}, [jkMusic?.id, jkMusic?.source])

	return { isFavorite, toggleFavorite }
}

export default useTrackPlayerFavorite
