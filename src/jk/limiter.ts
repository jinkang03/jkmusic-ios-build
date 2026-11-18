import { logInfo } from '@/helpers/logger'
/** 极简并发闸门：active 达到 limit 时排队，保证同一时刻不超过 limit 个任务 */
let active = 0
const queue: Array<() => void> = []

export const getActive = () => active

export const withLimit = async <T>(limit: number, task: () => Promise<T>): Promise<T> => {
	const cap = Math.max(1, limit)
	if (active >= cap) {
		logInfo('[limit] queued active=', active, 'cap=', cap)
		await new Promise<void>(r => queue.push(r))
	}
	active++
	logInfo('[limit] enter active=', active, 'cap=', cap)
	try {
		return await task()
	} finally {
		active--
		logInfo('[limit] leave active=', active)
		const next = queue.shift()
		if (next) next()
	}
}

export default { withLimit, getActive }
