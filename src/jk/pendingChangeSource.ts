/**
 * 歌曲换源弹窗的入参：用模块级变量传完整曲目对象。
 * URL 参数会丢掉 meta（songmid/source/albumName），换源后无法取流。
 */
import type { JKMusic } from './musicSdk'

let pending: JKMusic | null = null

export const setPendingChangeSource = (music: JKMusic | null) => { pending = music }

export const takePendingChangeSource = () => {
	const p = pending
	pending = null
	return p
}

export default { setPendingChangeSource, takePendingChangeSource }
