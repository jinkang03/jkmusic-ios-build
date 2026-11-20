import { requireNativeModule } from 'expo'

type LiveActivityNative = {
	isSupported: () => boolean
	start: (
		title: string,
		artist: string,
		primaryHex: string,
		duration: number,
		progress: number,
		isPlaying: boolean,
		artworkBase64: string,
	) => Promise<void>
	update: (progress: number, isPlaying: boolean) => Promise<void>
	end: () => Promise<void>
}

let mod: LiveActivityNative | null = null
try {
	mod = requireNativeModule<LiveActivityNative>('CyMusicLiveActivity')
} catch {
	mod = null
}

export const isLiveActivitySupported = () => {
	try { return !!mod?.isSupported?.() } catch { return false }
}

export const startLiveActivity = async(params: {
	title: string
	artist: string
	primaryHex: string
	duration: number
	progress: number
	isPlaying: boolean
	/** 96x96 JPEG 的 base64；空则灵动岛显示占位图标 */
	artworkBase64?: string
}) => {
	if (!mod) return
	try {
		await mod.start(
			params.title,
			params.artist,
			params.primaryHex,
			params.duration,
			Math.max(0, Math.min(1, params.progress)),
			params.isPlaying,
			String(params.artworkBase64 ?? ''),
		)
	} catch { /* 不支持时静默 */ }
}

export const updateLiveActivity = async(progress: number, isPlaying: boolean) => {
	if (!mod) return
	try { await mod.update(Math.max(0, Math.min(1, progress)), isPlaying) } catch { /* ignore */ }
}

export const endLiveActivity = async() => {
	if (!mod) return
	try { await mod.end() } catch { /* ignore */ }
}
