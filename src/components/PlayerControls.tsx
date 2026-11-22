import { useThemeColors } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'
import myTrackPlayer, { playbackIntentStore, trackSkipLoadingStore, trackSourceLoadingStore } from '@/helpers/trackPlayerIndex'
import { FontAwesome6 } from '@expo/vector-icons'
import React from 'react'
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native'
import { PlaybackState, useIsPlaying, usePlaybackState } from '@rntp/player'

type PlayerControlsProps = {
	style?: ViewStyle
}

type PlayerButtonProps = {
	style?: ViewStyle
	iconSize?: number
	disabled?: boolean
	/** 覆盖图标颜色（播放条上固定白色，不跟随文字颜色） */
	color?: string
}

export const PlayerControls = React.memo(({ style }: PlayerControlsProps) => {
	return (
		<View style={[styles.container, style]}>
			<View style={styles.row}>
				<SkipToPreviousButton />
				<PlayPauseButton />
				<SkipToNextButton />
			</View>
		</View>
	)
})

export const PlayPauseButton = React.memo(({ style, iconSize = 48, variant = 'full', color }: PlayerButtonProps & { variant?: 'mini' | 'full' }) => {
	const playing = useIsPlaying()
	const state = usePlaybackState()
	const intent = playbackIntentStore.useValue()
	const sourcePending = trackSourceLoadingStore.useValue() !== null
	const shouldPause = playing || (intent === 'play' && (sourcePending || state === PlaybackState.Buffering))
	const colors = useThemeColors()

	if (variant === 'mini') {
		// 迷你播放条复用同一按钮，保持原尺寸，不受大圆样式影响
		return (
			<View style={[{ height: iconSize }, style]}>
				<TouchableOpacity
					activeOpacity={0.85}
					hitSlop={10}
					onPress={() => shouldPause ? myTrackPlayer.pause() : void myTrackPlayer.play()}
				>
					<FontAwesome6 name={shouldPause ? 'pause' : 'play'} size={iconSize} color={color ?? colors.text} />
				</TouchableOpacity>
			</View>
		)
	}

	// 播放详情页：56 直径圆形 primary 底 + 白色图标
	return (
		<View style={[{ height: iconSize }, style]}>
			<TouchableOpacity
				activeOpacity={0.85}
				hitSlop={10}
				onPress={() => shouldPause ? myTrackPlayer.pause() : void myTrackPlayer.play()}
				style={{
					width: 56, height: 56, borderRadius: 28,
					backgroundColor: macPalette(false).primary,
					alignItems: 'center', justifyContent: 'center',
				}}
			>
				<FontAwesome6 name={shouldPause ? 'pause' : 'play'} size={24} color="#fff" />
			</TouchableOpacity>
		</View>
	)
})

export const SkipToNextButton = React.memo(({ iconSize = 30, disabled = false, color }: PlayerButtonProps) => {
	const colors = useThemeColors()
	const trackSkipLoading = trackSkipLoadingStore.useValue()
	const isLoading = trackSkipLoading === 'next'
	const isDisabled = disabled || trackSkipLoading !== null

	return (
		<TouchableOpacity activeOpacity={0.7} hitSlop={10} disabled={isDisabled} onPress={myTrackPlayer.skipToNext}>
			<View style={styles.iconContainer}>
				{isLoading ? (
					<ActivityIndicator size="small" color={color ?? colors.text} />
				) : (
					<FontAwesome6 name="forward" size={iconSize} color={color ?? colors.text} />
				)}
			</View>
		</TouchableOpacity>
	)
})

export const SkipToPreviousButton = React.memo(({ iconSize = 30, color }: PlayerButtonProps) => {
	const colors = useThemeColors()
	const trackSkipLoading = trackSkipLoadingStore.useValue()
	const isLoading = trackSkipLoading === 'previous'
	const isDisabled = trackSkipLoading !== null

	return (
		<TouchableOpacity
			activeOpacity={0.7}
			hitSlop={10}
			disabled={isDisabled}
			onPress={myTrackPlayer.skipToPrevious}
		>
			<View style={styles.iconContainer}>
				{isLoading ? (
					<ActivityIndicator size="small" color={color ?? colors.text} />
				) : (
					<FontAwesome6 name={'backward'} size={iconSize} color={color ?? colors.text} />
				)}
			</View>
		</TouchableOpacity>
	)
})

const styles = StyleSheet.create({
	container: {
		width: '100%',
	},
	row: {
		flexDirection: 'row',
		justifyContent: 'space-evenly',
		alignItems: 'center',
	},
	iconContainer: {
		minWidth: 32,
		minHeight: 32,
		alignItems: 'center',
		justifyContent: 'center',
	},
})
