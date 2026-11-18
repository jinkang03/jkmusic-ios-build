/**
 * 添加歌曲到歌单时，用模块级变量传递完整对象。
 * 走 URL 参数会把 meta（songmid/source/albumName）丢掉，导致加进去的歌无法取流。
 */
import type { JKMusic } from './musicSdk'

let pending: JKMusic | null = null

export const setPendingMusic = (m: JKMusic) => { pending = m }

export const peekPendingMusic = () => pending

export const takePendingMusic = () => {
	const p = pending
	pending = null
	return p
}

export default { setPendingMusic, takePendingMusic, peekPendingMusic }
