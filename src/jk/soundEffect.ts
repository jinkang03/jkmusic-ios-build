/* eslint-disable @typescript-eslint/no-require-imports -- Metro 静态资源必须用 require() */
/**
 * 音效（对齐 Mac 端）：设置读写、预设表、下发到原生 DSP。
 *
 * 设置 key 与 Mac 完全一致（player.soundEffect.*），备份可以互通。
 * DSP 在 iOS 侧是 AVPlayerItem 的 MTAudioProcessingTap：
 *   EQ×10 → dry gain → 压缩器 → 3D 环绕
 */
import { Asset } from 'expo-asset'
import { NativeModules, TurboModuleRegistry } from 'react-native'

import { logInfo } from '@/helpers/logger'
import { getSetting, setSetting } from './settingsStore'

export const SOUND_EFFECT_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const

export const SOUND_EFFECT_KEYS = {
	enabled: 'player.soundEffect.enabled',
	ir: 'player.soundEffect.convolution.fileName',
	mainGain: 'player.soundEffect.convolution.mainGain',
	sendGain: 'player.soundEffect.convolution.sendGain',
	pannerEnabled: 'player.soundEffect.panner.enable',
	pannerSoundR: 'player.soundEffect.panner.soundR',
	pannerSpeed: 'player.soundEffect.panner.speed',
	pitch: 'player.soundEffect.pitchShifter.playbackRate',
} as const

export const eqKey = (hz: number) => `player.soundEffect.biquadFilter.hz${hz}`

export type EqPreset = { id: string, zh: string, en: string, gains: number[] }

/** 与 Mac 端 freqsPreset 数值一致 */
export const EQ_PRESETS: EqPreset[] = [
	{ id: 'pop', zh: '流行', en: 'Pop', gains: [6, 5, -3, -2, 5, 4, -4, -3, 6, 4] },
	{ id: 'dance', zh: '舞曲', en: 'Dance', gains: [4, 3, -4, -6, 0, 0, 3, 4, 4, 5] },
	{ id: 'rock', zh: '摇滚', en: 'Rock', gains: [7, 6, 2, 1, -3, -4, 2, 1, 4, 5] },
	{ id: 'classical', zh: '古典', en: 'Classical', gains: [6, 7, 1, 2, -1, 1, -4, -6, -7, -8] },
	{ id: 'vocal', zh: '人声', en: 'Vocal', gains: [-5, -6, -4, -3, 3, 4, 5, 4, -3, -3] },
	{ id: 'slow', zh: '慢歌', en: 'Slow', gains: [5, 4, 2, 0, -2, 0, 3, 6, 7, 8] },
	{ id: 'electronic', zh: '电子乐', en: 'Electronic', gains: [6, 5, 0, -5, -4, 0, 6, 8, 8, 7] },
	{ id: 'subwoofer', zh: '重低音', en: 'Subwoofer', gains: [8, 7, 5, 4, 0, 0, 0, 0, 0, 0] },
	{ id: 'soft', zh: '柔和', en: 'Soft', gains: [-5, -5, -4, -4, 3, 2, 4, 4, 0, 0] },
]

export type ConvolutionPreset = {
	file: string
	zh: string
	en: string
	mainGain: number
	sendGain: number
}

/** 与 Mac 端 convolutions 一致（fileName / mainGain / sendGain） */
export const CONVOLUTIONS: ConvolutionPreset[] = [
	{ file: 'filter-telephone.wav', zh: '电话', en: 'Telephone', mainGain: 0.0, sendGain: 3.0 },
	{ file: 's2_r4_bd.wav', zh: '教堂', en: 'Church', mainGain: 1.8, sendGain: 0.9 },
	{ file: 'bright-hall.wav', zh: '大厅', en: 'Hall', mainGain: 0.8, sendGain: 2.4 },
	{ file: 'cinema-diningroom.wav', zh: '电影院', en: 'Cinema', mainGain: 0.6, sendGain: 2.3 },
	{ file: 'dining-living-true-stereo.wav', zh: '餐厅', en: 'Dining Room', mainGain: 0.6, sendGain: 1.8 },
	{ file: 'living-bedroom-leveled.wav', zh: '卫生间', en: 'Bathroom', mainGain: 0.6, sendGain: 2.1 },
	{ file: 'spreader50-65ms.wav', zh: '室内', en: 'Indoor', mainGain: 1.0, sendGain: 2.5 },
	{ file: 's3_r1_bd.wav', zh: '立体声', en: 'Stereo', mainGain: 1.8, sendGain: 0.8 },
	{ file: 'matrix-reverb1.wav', zh: '矩阵混响（1）', en: 'Matrix (1)', mainGain: 1.5, sendGain: 0.9 },
	{ file: 'matrix-reverb2.wav', zh: '矩阵混响（2）', en: 'Matrix (2)', mainGain: 1.3, sendGain: 1.0 },
	{ file: 'cardiod-35-10-spread.wav', zh: '心形扩散', en: 'Heart-shaped Diffusion', mainGain: 1.8, sendGain: 0.6 },
	{ file: 'tim-omni-35-10-magnetic.wav', zh: '磁性立体声', en: 'Magnetic Stereo', mainGain: 1.0, sendGain: 0.2 },
	{ file: 'feedback-spring.wav', zh: '反馈弹簧', en: 'Feedback Spring', mainGain: 1.8, sendGain: 0.8 },
]

/**
 * 13 个 IR 打进了 assets/soundEffects（与 Mac 端同名同文件）。
 * Metro 会把 .wav 当资源，运行时通过 expo-asset 解析成 file:// 路径交给原生。
 */
const IR_MODULES: Record<string, number> = {
	'filter-telephone.wav': require('../../assets/soundEffects/filter-telephone.wav'),
	's2_r4_bd.wav': require('../../assets/soundEffects/s2_r4_bd.wav'),
	'bright-hall.wav': require('../../assets/soundEffects/bright-hall.wav'),
	'cinema-diningroom.wav': require('../../assets/soundEffects/cinema-diningroom.wav'),
	'dining-living-true-stereo.wav': require('../../assets/soundEffects/dining-living-true-stereo.wav'),
	'living-bedroom-leveled.wav': require('../../assets/soundEffects/living-bedroom-leveled.wav'),
	'spreader50-65ms.wav': require('../../assets/soundEffects/spreader50-65ms.wav'),
	's3_r1_bd.wav': require('../../assets/soundEffects/s3_r1_bd.wav'),
	'matrix-reverb1.wav': require('../../assets/soundEffects/matrix-reverb1.wav'),
	'matrix-reverb2.wav': require('../../assets/soundEffects/matrix-reverb2.wav'),
	'cardiod-35-10-spread.wav': require('../../assets/soundEffects/cardiod-35-10-spread.wav'),
	'tim-omni-35-10-magnetic.wav': require('../../assets/soundEffects/tim-omni-35-10-magnetic.wav'),
	'feedback-spring.wav': require('../../assets/soundEffects/feedback-spring.wav'),
}

const irPathCache = new Map<string, string>()

/** IR 文件名 → 沙盒/包内 file:// 路径（失败返回空串，混响不生效但不影响其它效果） */
export const resolveIrPath = async(file: string): Promise<string> => {
	if (!file) return ''
	const cached = irPathCache.get(file)
	if (cached) return cached
	const mod = IR_MODULES[file]
	if (!mod) return ''
	try {
		const asset = Asset.fromModule(mod)
		await asset.downloadAsync()
		const uri = asset.localUri ?? asset.uri ?? ''
		if (uri) irPathCache.set(file, uri)
		return uri
	} catch (err) {
		logInfo('[soundEffect] resolveIr failed', file, String((err as any)?.message ?? err))
		return ''
	}
}

export const getEqGains = (): number[] =>
	SOUND_EFFECT_FREQS.map(hz => {
		const v = Number(getSetting(eqKey(hz), 0))
		return Number.isFinite(v) ? Math.max(-15, Math.min(15, v)) : 0
	})

export const setEqGains = (gains: number[]) => {
	SOUND_EFFECT_FREQS.forEach((hz, i) => {
		const v = Math.round(gains[i] ?? 0)
		setSetting(eqKey(hz), Math.max(-15, Math.min(15, v)))
	})
	applySoundEffect()
}

export const isSoundEffectEnabled = () => !!getSetting(SOUND_EFFECT_KEYS.enabled, false)

export const getSoundEffectConfig = () => {
	const enabled = isSoundEffectEnabled()
	const dryGain = Number(getSetting(SOUND_EFFECT_KEYS.mainGain, 10)) / 10
	const wetGain = Number(getSetting(SOUND_EFFECT_KEYS.sendGain, 0)) / 10
	const pannerEnabled = !!getSetting(SOUND_EFFECT_KEYS.pannerEnabled, false)
	const pannerRadius = Number(getSetting(SOUND_EFFECT_KEYS.pannerSoundR, 5)) / 10
	const speed = Math.max(1, Number(getSetting(SOUND_EFFECT_KEYS.pannerSpeed, 25)))
	const rawPitch = Number(getSetting(SOUND_EFFECT_KEYS.pitch, 1))
	const pitch = Number.isFinite(rawPitch) ? Math.min(1.5, Math.max(0.5, rawPitch)) : 1
	return {
		enabled,
		ir: String(getSetting(SOUND_EFFECT_KEYS.ir, '') ?? ''),
		eq: getEqGains(),
		dryGain: Number.isFinite(dryGain) ? dryGain : 1,
		wetGain: Number.isFinite(wetGain) ? wetGain : 0,
		pannerEnabled,
		pannerRadius: Number.isFinite(pannerRadius) ? pannerRadius : 0.5,
		// Mac: 每 tick 1°，tick = 2*speed ms → 每秒 500/speed 度
		pannerDegPerSec: 500 / speed,
		pitch,
	}
}

let lastPushed = ''

/** 把当前设置推给原生（内容没变就跳过，避免无意义的音频线程重建） */
export const applySoundEffect = async(force = false) => {
	const cfg = getSoundEffectConfig()
	const irPath = await resolveIrPath(cfg.ir)
	const payload = { ...cfg, irPath }
	const json = JSON.stringify(payload)
	if (!force && json === lastPushed) return
	lastPushed = json
	try {
		// 新架构下 TrackPlayer 是 TurboModule，NativeModules 代理不一定带自定义方法
		const native = (TurboModuleRegistry.get('TrackPlayer') as any)
			?? (NativeModules as any).TrackPlayer
		if (typeof native?.setSoundEffect === 'function') {
			native.setSoundEffect(payload)
			logInfo('[soundEffect] pushed', json.slice(0, 200))
		} else {
			logInfo('[soundEffect] native setSoundEffect 不可用')
		}
	} catch (err) {
		logInfo('[soundEffect] push failed', String((err as any)?.message ?? err))
	}
}

/** 选环境音效：写入文件名 + 该预设的干湿增益（与 Mac 行为一致）；传空 = 关闭混响 */
export const setConvolutionPreset = (file: string) => {
	const preset = CONVOLUTIONS.find(c => c.file === file)
	setSetting(SOUND_EFFECT_KEYS.ir, file)
	if (preset) {
		setSetting(SOUND_EFFECT_KEYS.mainGain, Math.round(preset.mainGain * 10))
		setSetting(SOUND_EFFECT_KEYS.sendGain, Math.round(preset.sendGain * 10))
	}
	void applySoundEffect()
}
