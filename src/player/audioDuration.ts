/**
 * 本地音频时长探测（不依赖播放器）。
 *
 * 为什么需要：脚本在某些曲目上只返回「试听片段」（实测 tx 的 Fractals 只有 60s / 960KB，
 * 但元数据写着 4:30）。旧实现把片段当完整曲目缓存并播放，片段播完就当"正常结束"
 * 自动下一首，表现为歌单连跳。这里下载完先量一下真实时长。
 *
 * 支持 flac / mp3 / m4a；读不到就返回 null（调用方跳过校验，不阻塞播放）。
 */
import * as FileSystem from 'expo-file-system/legacy'

const HEAD_BYTES = 96 * 1024

const b64ToBytes = (b64: string): Uint8Array | null => {
	const atobFn = (globalThis as any).atob
	if (typeof atobFn !== 'function') return null
	const bin = atobFn(b64)
	const out = new Uint8Array(bin.length)
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
	return out
}

const ascii = (b: Uint8Array, at: number, len: number) =>
	String.fromCharCode(...Array.from(b.subarray(at, at + len)))

const u32 = (b: Uint8Array, at: number) =>
	((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3]

const flacDuration = (b: Uint8Array): number | null => {
	if (ascii(b, 0, 4) !== 'fLaC') return null
	// STREAMINFO 必须是第一个 metadata block：4 (magic) + 4 (header) 之后是内容
	const p = 8
	if (b.length < p + 18) return null
	// 8 字节 = sampleRate(20) + channels-1(3) + bps-1(5) + totalSamples(36)
	// 拆成两个 32 位整数算，避免 BigInt（当前 tsconfig target < ES2020）
	const hi = u32(b, p + 10)
	const lo = u32(b, p + 14)
	const sampleRate = hi >>> 12
	const totalSamples = ((hi & 0x0f) * 4294967296) + lo
	if (!sampleRate || !totalSamples) return null
	return totalSamples / sampleRate
}

const mp3Duration = (b: Uint8Array, fileSize: number): number | null => {
	let p = 0
	if (ascii(b, 0, 3) === 'ID3') {
		const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)
		p = 10 + size
	}
	// 找第一个合法帧头
	for (; p + 4 < b.length; p++) {
		if (b[p] !== 0xff || (b[p + 1] & 0xe0) !== 0xe0) continue
		const version = (b[p + 1] >> 3) & 0x03 // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
		const bitrateIdx = (b[p + 2] >> 4) & 0x0f
		const srIdx = (b[p + 2] >> 2) & 0x03
		if (bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) continue
		const sampleRate = [44100, 48000, 32000][srIdx] >> (version === 3 ? 0 : version === 2 ? 1 : 2)
		const bitrate = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bitrateIdx]
		// Xing/Info 帧：帧数 × 每帧采样数
		const xing = b.indexOf(0x58, p) // 'X'
		if (xing > p && (ascii(b, xing, 4) === 'Xing' || ascii(b, xing, 4) === 'Info')) {
			const frames = u32(b, xing + 8)
			const spf = version === 3 ? 1152 : 576
			if (frames > 0 && sampleRate > 0) return (frames * spf) / sampleRate
		}
		// 否则按比特率估算（CBR）
		if (bitrate > 0 && fileSize > 0) return (fileSize * 8) / (bitrate * 1000)
		break
	}
	return null
}

const m4aDuration = (b: Uint8Array): number | null => {
	// moov/mvhd：在头部 96KB 内找 mvhd 即可（iPhone 录音/转码通常前置 moov）
	const at = ascii(b, 0, b.length).indexOf('mvhd')
	if (at < 0 || at + 24 >= b.length) return null
	const version = b[at + 4]
	if (version === 1) {
		const timescale = u32(b, at + 20)
		const dur = (u32(b, at + 24) * 4294967296) + u32(b, at + 28)
		return timescale > 0 ? dur / timescale : null
	}
	const timescale = u32(b, at + 12)
	const dur = u32(b, at + 16)
	return timescale > 0 && dur > 0 ? dur / timescale : null
}

/** 读取本地音频文件的时长（秒）；无法识别返回 null */
export const readAudioDuration = async(localPath: string): Promise<number | null> => {
	try {
		const uri = localPath.startsWith('file://') ? localPath : `file://${localPath}`
		const b64 = await (FileSystem as any).readAsStringAsync(uri, {
			encoding: 'base64',
			length: HEAD_BYTES,
			position: 0,
		})
		if (!b64) return null
		const bytes = b64ToBytes(String(b64))
		if (!bytes) return null
		const sizeInfo: any = await (FileSystem as any).getInfoAsync(uri)
		const fileSize = Number(sizeInfo?.size ?? 0)
		const byFlac = flacDuration(bytes)
		if (byFlac && byFlac > 1) return byFlac
		const byM4a = m4aDuration(bytes)
		if (byM4a && byM4a > 1) return byM4a
		const byMp3 = mp3Duration(bytes, fileSize)
		if (byMp3 && byMp3 > 1) return byMp3
		return null
	} catch {
		return null
	}
}

/** "03:24" / "3:24" / 秒数 → 秒；解析失败返回 0 */
export const parseIntervalSeconds = (interval: any): number => {
	if (typeof interval === 'number' && Number.isFinite(interval)) return Math.max(0, interval)
	const text = String(interval ?? '').trim()
	if (!text) return 0
	if (/^\d+(\.\d+)?$/.test(text)) return Number(text)
	const parts = text.split(':').map(Number)
	if (parts.some(n => !Number.isFinite(n))) return 0
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
	if (parts.length === 2) return parts[0] * 60 + parts[1]
	return 0
}

/** "25.30 MiB" / "960 KB" → 字节数（解析失败 0） */
export const parseSizeText = (text: any): number => {
	const m = /([\d.]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib)/i.exec(String(text ?? ''))
	if (!m) return 0
	const n = Number(m[1])
	if (!Number.isFinite(n) || n <= 0) return 0
	const unit = m[2].toLowerCase()
	const mul = unit.startsWith('g') ? 1024 ** 3 : unit.startsWith('m') ? 1024 ** 2 : unit.startsWith('k') ? 1024 : 1
	return n * mul
}

/**
 * 从曲目元数据推「完整文件应该多大」：优先当前音质，其次 flac/320k/128k。
 * 歌单导入与搜索结果一般都会带 qualitys，用于识别试听片段最可靠。
 */
/** 兼容两种对象：IMusic.IMusicItem（interval/meta）与 Track（duration/lxMusic.meta） */
export const intervalOf = (musicItem: any) =>
	musicItem?.interval ?? musicItem?.lxMusic?.interval ?? musicItem?.duration ?? 0

export const sizeHintBytes = (musicItem: any, quality?: string): number => {
	const meta = musicItem?.meta ?? musicItem?.lxMusic?.meta ?? {}
	const map = meta._qualitys ?? {}
	const list: any[] = Array.isArray(meta.qualitys) ? meta.qualitys : []
	const pick = (key: string) => parseSizeText(map?.[key]?.size) || parseSizeText(list.find(x => x?.type === key)?.size)
	return pick(String(quality ?? '')) || pick('flac') || pick('320k') || pick('128k')
}

/** 文件明显小于元数据标称大小（<60%）→ 视为片段 */
export const isTruncatedBySize = (fileSize: number, hintBytes: number): boolean => {
	if (!hintBytes || hintBytes < 200 * 1024) return false
	if (!fileSize || fileSize <= 0) return false
	return fileSize < hintBytes * 0.6
}

/**
 * 判定「下载到的是试听片段」：
 * 实际时长 < 预期时长的 80%（且预期时长 > 30s，避免短曲误判）。
 */
export const isTruncatedAudio = (
	actualSeconds: number | null,
	expectedSeconds: number,
): boolean => {
	if (!actualSeconds || actualSeconds <= 1) return false
	if (!expectedSeconds || expectedSeconds < 30) return false
	return actualSeconds < expectedSeconds * 0.8
}
