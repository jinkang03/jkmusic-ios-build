/** 下载任务表：供下载页显示「正在下载 / 进度 / 失败重试」 */
import { GlobalState } from '@/utils/stateMapper'

export type DownloadTask = {
	id: string
	title: string
	percent: number
	status: 'downloading' | 'done' | 'failed'
	error?: string
	attempts?: number
}

export const downloadTasksStore = new GlobalState<Record<string, DownloadTask>>({})

export const upsertTask = (task: Partial<DownloadTask> & { id: string }) => {
	const all = { ...downloadTasksStore.getValue() }
	all[task.id] = { ...(all[task.id] ?? { percent: 0, status: 'downloading', title: '' }), ...task }
	downloadTasksStore.setValue(all)
}

export const removeTask = (id: string) => {
	const all = { ...downloadTasksStore.getValue() }
	delete all[id]
	downloadTasksStore.setValue(all)
}

export default { downloadTasksStore, upsertTask, removeTask }
