/**
 * 色盘选色（强调色自定义）。
 * 纯 JS 实现：饱和度/亮度面板（两层 LinearGradient 叠加）+ 色相条，不引新依赖。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { tr } from '@/utils/i18n'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export const hsvToHex = (h: number, s: number, v: number): string => {
	const c = v * s
	const hp = (h % 360) / 60
	const x = c * (1 - Math.abs((hp % 2) - 1))
	let r = 0
	let g = 0
	let b = 0
	if (hp < 1) { r = c; g = x } else if (hp < 2) { r = x; g = c } else if (hp < 3) { g = c; b = x } else if (hp < 4) { g = x; b = c } else if (hp < 5) { r = x; b = c } else { r = c; b = x }
	const m = v - c
	const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
	return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

export const hexToHsv = (hex: string): { h: number, s: number, v: number } => {
	const clean = String(hex ?? '').replace('#', '')
	if (!/^[\da-f]{6}$/i.test(clean)) return { h: 300, s: 0.85, v: 0.95 }
	const r = parseInt(clean.slice(0, 2), 16) / 255
	const g = parseInt(clean.slice(2, 4), 16) / 255
	const b = parseInt(clean.slice(4, 6), 16) / 255
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const d = max - min
	let h = 0
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6
		else if (max === g) h = (b - r) / d + 2
		else h = (r - g) / d + 4
		h *= 60
		if (h < 0) h += 360
	}
	return { h, s: max === 0 ? 0 : d / max, v: max }
}

type Props = {
	visible: boolean
	initialColor?: string
	/** 当前是否「跟随壁纸」 */
	followWallpaper?: boolean
	onClose: () => void
	onPick: (color: string) => void
	onFollowWallpaper: () => void
}

const ColorPickerModal = ({ visible, initialColor, followWallpaper, onClose, onPick, onFollowWallpaper }: Props) => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const initial = useMemo(() => hexToHsv(initialColor || '#E240F7'), [initialColor])
	const [h, setH] = useState(initial.h)
	const [s, setS] = useState(initial.s)
	const [v, setV] = useState(initial.v)
	const [panel, setPanel] = useState({ w: 0, h: 0 })
	const [hueBar, setHueBar] = useState({ w: 0 })

	useEffect(() => {
		if (!visible) return
		const next = hexToHsv(initialColor || '#E240F7')
		setH(next.h)
		setS(next.s)
		setV(next.v)
	}, [visible, initialColor])

	const color = hsvToHex(h, s, v)

	const svPan = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: (e) => {
				setS(clamp01(e.nativeEvent.locationX / Math.max(1, panel.w)))
				setV(1 - clamp01(e.nativeEvent.locationY / Math.max(1, panel.h)))
			},
			onPanResponderMove: (e) => {
				setS(clamp01(e.nativeEvent.locationX / Math.max(1, panel.w)))
				setV(1 - clamp01(e.nativeEvent.locationY / Math.max(1, panel.h)))
			},
		}),
	).current

	const huePan = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: (e) => {
				setH(clamp01(e.nativeEvent.locationX / Math.max(1, hueBar.w)) * 360)
			},
			onPanResponderMove: (e) => {
				setH(clamp01(e.nativeEvent.locationX / Math.max(1, hueBar.w)) * 360)
			},
		}),
	).current

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
			<Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: macSpace.pageX }} onPress={onClose}>
				<Pressable
					onPress={() => undefined}
					style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderRadius: macRadius.card, padding: 16 }}
				>
					<Text style={{ color: c.textStrong, fontSize: macFont.cardTitle, fontWeight: '700', marginBottom: 12 }}>
						{tr('自定义强调色', 'Custom Accent Color')}
					</Text>

					{/* 饱和度 / 亮度面板 */}
					<View
						onLayout={({ nativeEvent }) => setPanel({ w: nativeEvent.layout.width, h: nativeEvent.layout.height })}
						style={{ height: 180, borderRadius: macRadius.thumb, overflow: 'hidden', backgroundColor: hsvToHex(h, 1, 1) }}
						{...svPan.panHandlers}
					>
						<LinearGradient
							colors={['#FFFFFF', 'rgba(255,255,255,0)']}
							start={{ x: 0, y: 0.5 }}
							end={{ x: 1, y: 0.5 }}
							style={StyleSheet.absoluteFill}
						/>
						<LinearGradient
							colors={['rgba(0,0,0,0)', '#000000']}
							start={{ x: 0.5, y: 0 }}
							end={{ x: 0.5, y: 1 }}
							style={StyleSheet.absoluteFill}
						/>
						<View
							pointerEvents="none"
							style={{
								position: 'absolute',
								left: Math.max(0, s * panel.w - 9),
								top: Math.max(0, (1 - v) * panel.h - 9),
								width: 18, height: 18, borderRadius: 9,
								borderWidth: 2, borderColor: '#fff',
								backgroundColor: color,
								shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
							}}
						/>
					</View>

					{/* 色相条 */}
					<View
						onLayout={({ nativeEvent }) => setHueBar({ w: nativeEvent.layout.width })}
						style={{ marginTop: 14, height: 24, borderRadius: 12, overflow: 'hidden' }}
						{...huePan.panHandlers}
					>
						<LinearGradient
							colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']}
							start={{ x: 0, y: 0.5 }}
							end={{ x: 1, y: 0.5 }}
							style={StyleSheet.absoluteFill}
						/>
						<View
							pointerEvents="none"
							style={{
								position: 'absolute',
								left: Math.max(0, (h / 360) * hueBar.w - 2),
								top: 0, bottom: 0, width: 4, borderRadius: 2,
								backgroundColor: '#fff',
								borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)',
							}}
						/>
					</View>

					{/* 预览 + hex */}
					<View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 10 }}>
						<View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color, borderWidth: 0.5, borderColor: c.divider }} />
						<Text style={{ color: c.text, fontSize: macFont.body, fontVariant: ['tabular-nums'] }}>{color}</Text>
						<View style={{ flex: 1 }} />
						<Pressable onPress={onFollowWallpaper} hitSlop={6}>
							<Text style={{ color: followWallpaper ? c.primary : c.textMuted, fontSize: macFont.caption }}>
								{tr('跟随壁纸', 'Follow wallpaper')}
							</Text>
						</Pressable>
					</View>

					{/* 操作 */}
					<View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
						<Pressable
							onPress={onClose}
							style={{ flex: 1, height: 42, borderRadius: macRadius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fillSubtle }}
						>
							<Text style={{ color: c.text, fontSize: macFont.body }}>{tr('取消', 'Cancel')}</Text>
						</Pressable>
						<Pressable
							onPress={() => onPick(color)}
							style={{ flex: 1, height: 42, borderRadius: macRadius.card, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary }}
						>
							<Text style={{ color: '#fff', fontSize: macFont.body, fontWeight: '600' }}>{tr('确定', 'Apply')}</Text>
						</Pressable>
					</View>
				</Pressable>
			</Pressable>
		</Modal>
	)
}

export default ColorPickerModal
