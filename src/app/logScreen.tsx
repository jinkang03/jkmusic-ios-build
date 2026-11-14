/**
 * 应用日志（非模态路由）。
 *
 * 从 (modals)/logScreen 迁过来：模态会挡住后续深链导航（jkmusic://player 无效），
 * 而验收要靠「打开日志 → 再导航」这条链路，所以必须是普通 stack 页面。
 *
 * 支持：
 *   jkmusic://logScreen?clear=1     进入前清空，截图只含本次操作
 *   jkmusic://logScreen?filter=trial 只看包含该关键字的行
 */
import LogScreen from '@/components/LogScreen'
import { useLogger, useLoggerHook } from '@/helpers/logger'
import { useLocalSearchParams } from 'expo-router'
import React, { useEffect, useMemo, useRef } from 'react'

const LogScreenRoute = () => {
	const params = useLocalSearchParams<{ clear?: string, filter?: string }>()
	const { logs } = useLoggerHook()
	const clearLogs = useLogger.getState().clearLogs
	const didClear = useRef(false)

	useEffect(() => {
		if (String(params.clear ?? '') !== '1' || didClear.current) return
		didClear.current = true
		clearLogs()
	}, [params.clear, clearLogs])

	const filtered = useMemo(() => {
		const key = String(params.filter ?? '').toLowerCase()
		if (!key) return logs
		return logs.filter((item: any) => JSON.stringify(item).toLowerCase().includes(key))
	}, [logs, params.filter])

	return <LogScreen logsOverride={filtered} />
}

export default LogScreenRoute
