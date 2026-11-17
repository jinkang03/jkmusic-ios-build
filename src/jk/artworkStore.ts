/** 当前曲目的封面地址（播放页解析一次，迷你条/背景共用） */
import { GlobalState } from '@/utils/stateMapper'

export const currentArtworkStore = new GlobalState<string>('')

export default { currentArtworkStore }
