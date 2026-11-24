/**
 * 崩溃取证（JS 侧）
 *
 * 后台熄屏播放时 App「直接消失」，用户只能看到「重开之后进度还在、但没在播」。
 * 原生侧（AppDelegate 的 CrashForensics）会写两个文件：
 *   - jk-last-crash.txt          未捕获异常 / 致命信号的栈
 *   - jk-last-abnormal-exit.txt  上次没有走 applicationWillTerminate（被系统杀掉/崩溃）
 *
 * 这里在启动时把两个文件读出来，写进「播放诊断」页并落一条 crash.log，
 * 用户下次截图诊断页就能看到「上次是异常退出」还是「音频线程崩了」。
 * 另外接管 JS 未捕获错误，避免 release 下悄无声息。
 */
import type { PlaybackDiagEntry } from '@/jk/playbackDiagnostics'

const CRASH_FILE = 'jk-last-crash.txt'
const ABNORMAL_FILE = 'jk-last-abnormal-exit.txt'
const REPORT_FILE = 'jk-crash-report.log'

const MAX_REPORT = 40_000

type Fs = any
let fsPromise: Promise<Fs | null> | null = null

const getFs = (): Promise<Fs | null> => {
	if (!fsPromise) {
		fsPromise = import('expo-file-system/legacy')
			.then((mod: any) => (mod?.default ?? mod) as Fs)
			.catch(() => null)
	}
	return fsPromise
}

const readFile = async(fs: Fs, name: string): Promise<string> => {
	try {
		const uri = `${fs.documentDirectory}${name}`
		const info = await fs.getInfoAsync(uri)
		if (!info?.exists) return ''
		return await fs.readAsStringAsync(uri)
	} catch {
		return ''
	}
}

const removeFile = async(fs: Fs, name: string) => {
	try {
		await fs.deleteAsync(`${fs.documentDirectory}${name}`, { idempotent: true })
	} catch { /* ignore */ }
}

const appendReport = async(fs: Fs, text: string) => {
	try {
		const uri = `${fs.documentDirectory}${REPORT_FILE}`
		const prev = await readFile(fs, REPORT_FILE)
		let next = `${prev}${text}`
		if (next.length > MAX_REPORT) next = next.slice(-MAX_REPORT)
		await fs.writeAsStringAsync(uri, next)
	} catch { /* ignore */ }
}

/** 从栈里挑出第一行有意义的（去掉 RN 内部帧） */
const firstUsefulFrame = (text: string): string => {
	const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
	const pick = lines.find(l => /JKMUSIC|main\.jsbundle|src\/|index\.bundle/.test(l)) ?? lines[0] ?? ''
	return pick.slice(0, 160)
}

const record = async(entry: Omit<PlaybackDiagEntry, 'at'>) => {
	try {
		const m = await import('@/jk/playbackDiagnostics')
		m.recordDiagnostic(entry)
	} catch { /* ignore */ }
}

/**
 * 启动时调用：读取上一次运行的异常信息。
 * 有内容就记一条诊断，然后删掉文件，避免每次启动重复记录。
 */
export const reportPreviousRun = async() => {
	const fs = await getFs()
	if (!fs) return
	const crash = (await readFile(fs, CRASH_FILE)).trim()
	const abnormal = (await readFile(fs, ABNORMAL_FILE)).trim()

	if (crash) {
		const kind = crash.startsWith('exception|') ? '未捕获异常' : '致命信号'
		const head = crash.split('\n').slice(0, 2).join(' · ')
		await record({
			kind: 'crash',
			title: '上次崩溃',
			from: 'app',
			reason: kind,
			detail: `${head} | ${firstUsefulFrame(crash)}`.slice(0, 300),
		})
		await appendReport(fs, `\n===== crash @ ${new Date().toISOString()} =====\n${crash}\n`)
		await removeFile(fs, CRASH_FILE)
	} else if (abnormal) {
		const last = abnormal.split('\n').filter(Boolean).slice(-1)[0] ?? ''
		// 行格式：abnormal-exit|本次启动时间|版本|build|上次启动时间
		const parts = last.split('|')
		const version = parts[2] ?? '?'
		const build = parts[3] ?? '?'
		const startedAt = parts.slice(4).join('|') || '?'
		await record({
			kind: 'crash',
			title: '上次异常退出',
			from: 'app',
			reason: '被系统终止或崩溃（无栈）',
			detail: `版本 ${version} (${build}) 启动于 ${startedAt}｜熄屏/后台播放被杀`,
		})
		await appendReport(fs, `\n===== abnormal exit @ ${new Date().toISOString()} =====\n${abnormal}\n`)
		await removeFile(fs, ABNORMAL_FILE)
	}
}

/** JS 未捕获错误：release 下也要留痕 */
export const installJsErrorHandler = () => {
	try {
		const ErrorUtils: any = (global as any).ErrorUtils
		if (!ErrorUtils?.setGlobalHandler) return
		const prev = ErrorUtils.getGlobalHandler?.()
		ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
			const message = String(error?.message ?? error ?? 'unknown')
			const stack = String(error?.stack ?? '')
			void (async() => {
				const fs = await getFs()
				if (fs) {
					await appendReport(fs, `\n===== js error fatal=${!!isFatal} @ ${new Date().toISOString()} =====\n${message}\n${stack}\n`)
				}
			})()
			// 致命 JS 错误在 release 下会直接终止进程，先记一条诊断
			if (isFatal) {
				void record({
					kind: 'crash',
					title: 'JS 崩溃',
					from: 'js',
					reason: message.slice(0, 120),
					detail: firstUsefulFrame(stack) || message.slice(0, 160),
				})
			}
			if (typeof prev === 'function') prev(error, isFatal)
		})
	} catch { /* ignore */ }
}
