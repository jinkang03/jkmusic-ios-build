/**
 * 自定义源（lx-music 脚本）注册表：
 * 桌面版由主进程执行脚本，这里复用 Cymusic 原生 JavaScriptCore 运行时，
 * 把适配后的音源注入 global.lx.apis / qualityList，供 musicSdk 取播放地址。
 */

export interface JkSourceApi {
	getMusicUrl: (musicInfo: any, quality: string) => { promise: Promise<{ url: string, type: string }>, canceleFn?: () => void }
	getLyric?: (musicInfo: any) => { promise: Promise<any>, canceleFn?: () => void }
	getPic?: (musicInfo: any) => { promise: Promise<string>, canceleFn?: () => void }
}

type Registry = Record<string, JkSourceApi>

const state = {
	apis: {} as Registry,
	qualityList: {} as Record<string, string[]>,
}

const ensureGlobal = () => {
	const g: any = globalThis as any
	g.lx = g.lx ?? {}
	g.lx.apis = state.apis
	g.lx.qualityList = state.qualityList
}

ensureGlobal()

/** 注册/覆盖某个源（kw/kg/tx/wy/mg）的取地址能力 */
export const registerSourceApi = (source: string, api: Partial<JkSourceApi>, qualitys?: string[]) => {
	const current = state.apis[source] ?? ({} as JkSourceApi)
	state.apis[source] = { ...current, ...api }
	if (qualitys?.length) state.qualityList[source] = qualitys
	ensureGlobal()
}

export const unregisterSourceApi = (source: string) => {
	delete state.apis[source]
	delete state.qualityList[source]
	ensureGlobal()
}

export const clearSources = () => {
	for (const key of Object.keys(state.apis)) delete state.apis[key]
	for (const key of Object.keys(state.qualityList)) delete state.qualityList[key]
	ensureGlobal()
}

export const getRegisteredSources = () => Object.keys(state.apis)

export const hasSource = (source: string) => !!state.apis[source]

export default { registerSourceApi, unregisterSourceApi, clearSources, getRegisteredSources, hasSource }
