/**
 * 功能页面壁纸（对应 mac 端 #root 的 --background-image）。
 *
 * 层级：壁纸铺满 → 磨砂（BlurView）→ 页面半透明玻璃底色（macPalette().bg）。
 * 播放页不使用它（播放页背景是封面），所以这里只挂在根布局最底层。
 */
import { Image } from 'expo-image'
import { BlurView } from 'expo-blur'
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { wallpaperStore, getWallpaperUri } from '@/jk/themeStore'
import { useAppTheme } from '@/hooks/useAppTheme'

const WallpaperBackground = () => {
	const wallpaper = wallpaperStore.useValue()
	const { isDark } = useAppTheme()
	if (!wallpaper?.uri) return null

	const uri = getWallpaperUri(wallpaper.uri)
	if (!uri) return null

	// 磨砂 0..40 → BlurView 0..100（0 时完全不模糊，省一层渲染）
	const intensity = Math.round(Math.min(40, Math.max(0, Number(wallpaper.blur) || 0)) * 2.5)

	return (
		<View
			pointerEvents="none"
			style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#0B0B0C' : '#FFFFFF' }]}
		>
			<Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
			{intensity > 0 ? (
				<BlurView
					intensity={intensity}
					tint={isDark ? 'dark' : 'light'}
					style={StyleSheet.absoluteFill}
				/>
			) : null}
		</View>
	)
}

export default WallpaperBackground
