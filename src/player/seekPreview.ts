/**
 * 进度条拖动中的「预览位置」（秒）。
 * 松手前音频不会 seek，但歌词应该跟着拖动实时走，否则用户会觉得「拉完歌词对不上」。
 */
import { GlobalState } from '@/utils/stateMapper'

export const seekPreviewStore = new GlobalState<number | null>(null)

export const setSeekPreview = (seconds: number | null) => {
	seekPreviewStore.setValue(seconds)
}

export default seekPreviewStore
