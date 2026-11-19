import { createStore, useStore } from 'zustand'

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

type LogEntry = {
	timestamp: string
	level: LogLevel
	message: string
	details?: any[]
}

interface LoggerState {
	logs: LogEntry[]
	addLog: (level: LogLevel, ...args: any[]) => void
	clearLogs: () => void
}

const stringifyArg = (arg: any): string => {
	if (typeof arg === 'string') return arg
	try {
		return JSON.stringify(arg, null, 2)
	} catch (error) {
		return `[Unstringifiable Object]: ${Object.prototype.toString.call(arg)}`
	}
}

export const useLogger = createStore<LoggerState>((set) => ({
	logs: [],
	addLog: (level, ...args) =>
		set((state) => {
			const message = args.map(stringifyArg).join(' ')
			const newLog = {
				timestamp: new Date().toISOString(),
				level,
				message,
				details: args.length > 1 ? args : undefined,
			}

			// 在控制台打印日志
			console.log(`[${newLog.timestamp}] [${level}] ${message}`)

			return {
				logs: [
					...state.logs,
					{
						timestamp: new Date().toISOString(),
						level,
						message,
						details: args.length > 1 ? args : undefined,
					},
				],
			}
		}),
	clearLogs: () => set({ logs: [] }),
}))

// ============================================================
// dev-only 文件日志
// Release 构建下 RN 的 console.log 不进 os_log，simctl 抓不到；
// dev 模式下把日志同步落到 Documents/dev.log，验收直接读文件。
// ============================================================
const DEV_FILE_LOG = process.env.EXPO_PUBLIC_JK_DEV_IMPORT === '1'
let devLogText = ''
let devLogTimer: ReturnType<typeof setTimeout> | null = null
let devLogFs: any = null
let devLogPath = ''
let devLogStarted = false

const flushDevLog = () => {
	devLogTimer = null
	if (!devLogText) return
	const text = devLogText
	devLogText = ''
	void (async() => {
		try {
			if (!devLogFs) {
				const mod: any = await import('expo-file-system/legacy')
				devLogFs = mod?.default ?? mod
				devLogPath = `${devLogFs.documentDirectory}dev.log`
			}
			const previous = devLogStarted
				? await devLogFs.readAsStringAsync(devLogPath).catch(() => '')
				: ''
			devLogStarted = true
			let next = `${previous}${text}`
			if (next.length > 2_000_000) next = next.slice(-2_000_000)
			await devLogFs.writeAsStringAsync(devLogPath, next)
		} catch {
			/* 日志写失败不能影响主流程 */
		}
	})()
}

const appendDevLog = (line: string) => {
	if (!DEV_FILE_LOG) return
	devLogText += line
	if (devLogTimer) return
	devLogTimer = setTimeout(flushDevLog, 600)
}

const createLogFunction =
	(level: LogLevel) =>
	(...args: any[]) => {
		useLogger.getState().addLog(level, ...args)
		if (DEV_FILE_LOG) {
			try {
				const message = args.map(stringifyArg).join(' ')
				appendDevLog(`${new Date().toISOString()} [${level}] ${message}\n`)
			} catch { /* ignore */ }
		}
	}

export const logInfo = createLogFunction('INFO')
export const logWarn = createLogFunction('WARN')
export const logError = createLogFunction('ERROR')

export const useLoggerHook = () => useStore(useLogger)
