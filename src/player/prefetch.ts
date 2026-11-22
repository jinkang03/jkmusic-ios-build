/**
 * 顺序收听预取。
 *
 * 1.4.36 起：流式播放已经实测可用（起播 <1s、拖动正常），
 * 用户明确要求「播放路径不再下载，只保留手动下载」，
 * 所以这里不再解析/下载下一首 —— 预取会：
 *   1) 在后台跑一遍脚本取流（和当前曲抢带宽、触发限流）；
 *   2) 把整首文件写进 musicCache（几 MB ~ 50MB）；
 *   3) 让「下一首」其实是本地文件播放，看起来像「下载完再播」。
 *
 * 保留导出与世代号接口，调用方无需改动。
 */
let prefetchGeneration = 0

export const bumpPrefetchGeneration = () => { prefetchGeneration++ }

export const prefetchNext = async() => {
	// no-op：切歌直接流式取流，不再预下载
}

export default { prefetchNext, bumpPrefetchGeneration }
