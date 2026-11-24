/**
 * 音效设置面板（对齐 Mac 端的「音效设置（实验性）」）
 *
 * 批次 1：总开关 + 原始音频增益 + 3D 环绕 + 均衡器（含 9 个预设）
 * 批次 2 会补上环境混响（卷积）与「环境音效增益」。
 */
import React, { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'

import SettingRow from '@/components/settings/SettingRow'
import SettingSlider from '@/components/settings/SettingSlider'
import SettingSwitch from '@/components/settings/SettingSwitch'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { setSetting, useSetting } from '@/jk/settingsStore'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import {
	CONVOLUTIONS,
	EQ_PRESETS,
	SOUND_EFFECT_FREQS,
	SOUND_EFFECT_KEYS,
	applySoundEffect,
	getEqGains,
	setConvolutionPreset,
	setEqGains,
} from '@/jk/soundEffect'
import { tr } from '@/utils/i18n'

const bandLabel = (hz: number) => (hz < 1000 ? `${hz}` : `${hz / 1000}k`)

const SoundEffectPanel = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)

	const [enabled, setEnabled] = useSetting(SOUND_EFFECT_KEYS.enabled, false)
	const [mainGain, setMainGain] = useSetting(SOUND_EFFECT_KEYS.mainGain, 10)
	const [sendGain, setSendGain] = useSetting(SOUND_EFFECT_KEYS.sendGain, 0)
	const [ir, setIr] = useSetting(SOUND_EFFECT_KEYS.ir, '')
	const [pannerEnabled, setPannerEnabled] = useSetting(SOUND_EFFECT_KEYS.pannerEnabled, false)
	const [pannerR, setPannerR] = useSetting(SOUND_EFFECT_KEYS.pannerSoundR, 5)
	const [pannerSpeed, setPannerSpeed] = useSetting(SOUND_EFFECT_KEYS.pannerSpeed, 25)
	const [pitch, setPitch] = useSetting(SOUND_EFFECT_KEYS.pitch, 1)
	const [rate, setRate] = useSetting('player.playbackRate', 1)

	const [gains, setGains] = useState<number[]>(() => getEqGains())

	const push = useCallback(() => { void applySoundEffect() }, [])

	const onToggleEnabled = useCallback((v: boolean) => {
		setEnabled(v)
		void applySoundEffect()
	}, [setEnabled])

	const onMainGain = useCallback((v: number) => {
		setMainGain(Math.round(v))
		void applySoundEffect()
	}, [setMainGain])

	const onBand = useCallback((index: number, v: number) => {
		const next = [...gains]
		next[index] = Math.round(v)
		setGains(next)
		setSetting(`player.soundEffect.biquadFilter.hz${SOUND_EFFECT_FREQS[index]}`, next[index])
		void applySoundEffect()
	}, [gains])

	const applyPreset = useCallback((preset: number[]) => {
		setGains(preset)
		setEqGains(preset)
	}, [])

	const resetEq = useCallback(() => {
		const zero = SOUND_EFFECT_FREQS.map(() => 0)
		setGains(zero)
		setEqGains(zero)
	}, [])

	const sectionTitle = useMemo(() => (text: string) => (
		<Text style={{
			color: c.textMuted,
			fontSize: macFont.badge,
			paddingHorizontal: macSpace.pageX,
			paddingTop: 18,
			paddingBottom: 6,
		}}>{text}</Text>
	), [c])

	return (
		<ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
			<SettingRow
				label={tr('启用音效', 'Enable Sound Effects')}
				hint={tr('实验性功能：开启后播放会经过实时音频处理', 'Experimental: real-time audio processing while playing')}
			>
				<SettingSwitch value={!!enabled} onChange={onToggleEnabled} />
			</SettingRow>

			{/* 变调和变速：播放速度独立生效；音调走音效 DSP，需开启「启用音效」 */}
			<View style={{
				flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
				paddingHorizontal: macSpace.pageX, paddingTop: 18, paddingBottom: 6,
			}}>
				<Text style={{ color: c.textMuted, fontSize: macFont.badge }}>{tr('变调和变速', 'Pitch & Speed')}</Text>
				<TouchableOpacity
					onPress={() => {
						setPitch(1)
						setRate(1)
						void myTrackPlayer.setRate?.(1)
						void applySoundEffect()
					}}
					hitSlop={8}
				>
					<Text style={{ color: c.primary, fontSize: macFont.caption }}>{tr('重置', 'Reset')}</Text>
				</TouchableOpacity>
			</View>
			<SettingRow label={tr('播放速度', 'Playback Speed')} hint={tr('立即作用于当前播放', 'Applies to the current track immediately')}>
				<SettingSlider
					value={Number(rate) || 1}
					min={0.5}
					max={2}
					step={0.1}
					onChange={(v) => { setRate(v); void myTrackPlayer.setRate?.(v) }}
					format={(v) => `${v.toFixed(1)}x`}
				/>
			</SettingRow>
			<SettingRow
				label={tr('音调升降', 'Pitch')}
				hint={enabled ? tr('只改音高，不改速度', 'Pitch only, speed unchanged') : tr('需开启「启用音效」', 'Enable sound effects first')}
				disabled={!enabled}
			>
				<SettingSlider
					value={(Number(pitch) || 1) * 100}
					min={50}
					max={150}
					step={1}
					onChange={(v) => { setPitch(Math.round(v) / 100); void applySoundEffect() }}
					format={(v) => `${Math.round(v)}%`}
				/>
			</SettingRow>

			<View style={{ opacity: enabled ? 1 : 0.45 }} pointerEvents={enabled ? 'auto' : 'none'}>
				{sectionTitle(tr('环境混响音效', 'Reverb'))}
				<View style={{
					flexDirection: 'row', flexWrap: 'wrap', gap: 8,
					paddingHorizontal: macSpace.pageX, paddingBottom: 8,
				}}>
					{CONVOLUTIONS.map(item => {
						const active = String(ir ?? '') === item.file
						return (
							<Pressable
								key={item.file}
								onPress={() => {
									const next = active ? '' : item.file
									setIr(next)
									setConvolutionPreset(next)
								}}
								style={({ pressed }) => ({
									paddingHorizontal: 12,
									paddingVertical: 6,
									borderRadius: 14,
									backgroundColor: active
										? c.primary
										: (pressed ? c.fillMuted : c.fillSubtle),
								})}
							>
								<Text style={{
									color: active ? '#FFFFFF' : c.text,
									fontSize: macFont.caption,
								}}>
									{tr(item.zh, item.en)}
								</Text>
							</Pressable>
						)
					})}
				</View>

				{sectionTitle(tr('增益', 'Gain'))}
				<SettingRow label={tr('原始音频增益', 'Dry Gain')}>
					<SettingSlider
						value={Number(mainGain) || 0}
						min={0}
						max={50}
						step={1}
						onChange={onMainGain}
						format={(v) => `${Math.round(v) * 10}%`}
					/>
				</SettingRow>
				<SettingRow label={tr('环境音效增益', 'Wet Gain')} disabled={!ir}>
					<SettingSlider
						value={Number(sendGain) || 0}
						min={0}
						max={50}
						step={1}
						onChange={(v) => { setSendGain(Math.round(v)); void applySoundEffect() }}
						format={(v) => `${Math.round(v) * 10}%`}
					/>
				</SettingRow>

				{sectionTitle(tr('3D 立体环绕（需使用耳机）', '3D Stereo Surround (headphones)'))}
				<SettingRow label={tr('启用', 'Enabled')}>
					<SettingSwitch
						value={!!pannerEnabled}
						onChange={(v) => { setPannerEnabled(v); void applySoundEffect() }}
					/>
				</SettingRow>
				<SettingRow label={tr('环绕速度', 'Surround Speed')} disabled={!pannerEnabled}>
					<SettingSlider
						value={Number(pannerSpeed) || 25}
						min={1}
						max={50}
						step={1}
						onChange={(v) => { setPannerSpeed(Math.round(v)); void applySoundEffect() }}
						format={(v) => `${Math.round(v)}`}
					/>
				</SettingRow>
				<SettingRow label={tr('声音距离', 'Sound Distance')} disabled={!pannerEnabled}>
					<SettingSlider
						value={Number(pannerR) || 5}
						min={1}
						max={30}
						step={1}
						onChange={(v) => { setPannerR(Math.round(v)); void applySoundEffect() }}
						format={(v) => `${Math.round(v)}`}
					/>
				</SettingRow>

				<View style={{
					flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
					paddingHorizontal: macSpace.pageX, paddingTop: 18, paddingBottom: 6,
				}}>
					<Text style={{ color: c.textMuted, fontSize: macFont.badge }}>{tr('均衡器', 'Equalizer')}</Text>
					<TouchableOpacity onPress={resetEq} hitSlop={8}>
						<Text style={{ color: c.primary, fontSize: macFont.caption }}>{tr('重置', 'Reset')}</Text>
					</TouchableOpacity>
				</View>
				{SOUND_EFFECT_FREQS.map((hz, i) => (
					<SettingRow key={hz} label={`${bandLabel(hz)} Hz`}>
						<SettingSlider
							value={Number(gains[i] ?? 0)}
							min={-15}
							max={15}
							step={1}
							onChange={(v) => onBand(i, v)}
							format={(v) => `${Math.round(v)}dB`}
						/>
					</SettingRow>
				))}

				<View style={{
					flexDirection: 'row', flexWrap: 'wrap', gap: 8,
					paddingHorizontal: macSpace.pageX, paddingTop: 14, paddingBottom: 8,
				}}>
					{EQ_PRESETS.map(preset => (
						<Pressable
							key={preset.id}
							onPress={() => applyPreset(preset.gains)}
							style={({ pressed }) => ({
								paddingHorizontal: 14,
								paddingVertical: 7,
								borderRadius: 16,
								backgroundColor: pressed ? c.fillMuted : c.fillSubtle,
							})}
						>
							<Text style={{ color: c.text, fontSize: macFont.caption }}>
								{tr(preset.zh, preset.en)}
							</Text>
						</Pressable>
					))}
				</View>
			</View>
		</ScrollView>
	)
}

export default SoundEffectPanel
