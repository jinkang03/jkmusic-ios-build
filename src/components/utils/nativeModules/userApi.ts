import UserApiModule from '../../../../modules/cymusic-native/userApi'

// ============================================================
// 多脚本支持
// 原生侧每个脚本一个独立 JSC runtime，事件通过 generation 区分。
// 这里维护 generation → (脚本信息 / 清理回调)，并把所有 runtime 的事件
// 广播给订阅者；订阅者（adapter）按 event.generation 过滤自己的事件。
// ============================================================

type ScriptInfo = LX.UserApi.UserApiInfo & { script: string }

const scriptInfos = new Map<string, ScriptInfo>()
const disposers = new Map<string, () => void>()
const handlers = new Set<(event: any) => void>()
let listenerInstalled = false

export interface SendResponseParams {
	requestKey: string
	error: string | null
	response: {
		statusCode: number
		statusMessage: string
		headers: Record<string, string>
		body: any
	} | null
}
export interface SendActions {
	request: LX.UserApi.UserApiRequestParams
	response: SendResponseParams
}

const ensureBroadcast = () => {
	if (listenerInstalled) return
	listenerInstalled = true
	UserApiModule.addListener('api-action', (rawEvent: any) => {
		const { generation, ...payload } = rawEvent ?? {}
		if (!generation) return
		const info = scriptInfos.get(generation)
		if (!info) return

		let data = payload.data
		if (typeof data === 'string') {
			try { data = JSON.parse(data) } catch { /* keep raw string */ }
		}
		if (payload.action === 'init') {
			const initInfo = data?.info ?? {}
			// 脚本上报的 info 只包含 sources 等运行时信息，名称/版本要补全
			data = { ...(data ?? {}), info: { ...info, ...initInfo } }
		} else if (payload.action === 'showUpdateAlert') {
			if (!info.allowShowUpdateAlert) return
		}

		const event = { ...payload, generation, data }
		for (const handler of handlers) {
			try { handler(event) } catch { /* 单个订阅者异常不影响其它 */ }
		}
	})
}

export const loadScript = (
	info: ScriptInfo,
	onDispose?: () => void,
): string => {
	ensureBroadcast()
	const generation = UserApiModule.loadScript({
		id: info.id,
		name: info.name,
		description: info.description,
		version: info.version ?? '',
		author: info.author ?? '',
		homepage: info.homepage ?? '',
		script: info.script,
	})
	if (!generation) throw new Error('音源脚本加载失败')
	scriptInfos.set(generation, info)
	if (onDispose) disposers.set(generation, onDispose)
	return generation
}

export const sendAction = <T extends keyof SendActions>(
	action: T,
	data: SendActions[T],
	generation?: string | null,
) => {
	if (!generation) return
	UserApiModule.sendAction(action, JSON.stringify(data), generation)
}

export interface InitParams {
	status: boolean
	errorMessage: string
	info: LX.UserApi.UserApiInfo
}

export interface ResponseParams {
	status: boolean
	errorMessage?: string
	requestKey: string
	result: any
}

export interface UpdateInfoParams {
	name: string
	log: string
	updateUrl: string
}

export interface RequestParams {
	requestKey: string
	parentRequestKey?: string
	requestType?: 'current' | 'preload'
	url: string
	options: {
		method: string
		data?: any
		body?: any
		form?: Record<string, any>
		formData?: any
		timeout: number
		headers: any
		binary: boolean
	}
}

export type CancelRequestParams = string

export interface Actions {
	init: InitParams
	request: RequestParams
	cancelRequest: CancelRequestParams
	response: ResponseParams
	showUpdateAlert: UpdateInfoParams
	log: string
}
export type ActionsEvent = { [K in keyof Actions]: { action: K, data: Actions[K], generation: string } }[keyof Actions]

export const onScriptAction = (handler: (event: ActionsEvent) => void): () => void => {
	ensureBroadcast()
	handlers.add(handler)
	return () => {
		handlers.delete(handler)
	}
}

/**
 * 销毁指定脚本；不传 generation 时销毁全部。
 */
export const destroy = (generation?: string) => {
	if (generation) {
		const dispose = disposers.get(generation)
		disposers.delete(generation)
		scriptInfos.delete(generation)
		try { dispose?.() } catch { /* ignore */ }
		try { UserApiModule.destroy(generation) } catch { /* ignore */ }
		return
	}
	for (const [gen, dispose] of disposers) {
		try { dispose?.() } catch { /* ignore */ }
		void gen
	}
	disposers.clear()
	scriptInfos.clear()
	try { UserApiModule.destroy() } catch { /* ignore */ }
}

export const getLoadedGenerations = () => Array.from(scriptInfos.keys())
