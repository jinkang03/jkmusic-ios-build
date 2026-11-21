import { ThemeColors, fontSize } from '@/constants/tokens'
import { formatSecondsToMinutes } from '@/helpers/miscellaneous'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'
import { useDefaultStyles, useUtilsStyles } from '@/styles'
import React, { useCallback, useEffect, useMemo } from 'react'
import { StyleSheet, Text, View, ViewProps } from 'react-native'
import { Slider } from 'react-native-awesome-slider'
import Animated, { Reanimated3DefaultSpringConfig, SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { pendingRestorePositionStore } from '@/player/PlayerStore'

const AnimatedThumb = React.memo(({ isSliding, tint }: { isSliding: SharedValue<boolean>, tint: string }) => {

	const animatedStyle = useAnimatedStyle(() => {
		return {
			width: withSpring(isSliding.value ? 24 : 12, Reanimated3DefaultSpringConfig),
			height: withSpring(isSliding.value ? 24 : 12, Reanimated3DefaultSpringConfig),
			borderRadius: withSpring(isSliding.value ? 12 : 6, Reanimated3DefaultSpringConfig),
			backgroundColor: tint,
			left: 2,
		}
	})

	return <Animated.View style={animatedStyle} />
})

export const PlayerProgressBar = React.memo(({
	style,
	onSeek,
}: ViewProps & { onSeek?: (position: number) => void }) => {
	const colors = useThemeColors()
	const mac = macPalette(!!useAppTheme().isDark)
	const defaultStyles = useDefaultStyles()
	const utilsStyles = useUtilsStyles()
	const progressState = myTrackPlayer.useProgress(0.25)
	const restorePos = pendingRestorePositionStore.useValue()
	const current: any = myTrackPlayer.useCurrentMusic()
	// 启动恢复：还没开始播时，进度条显示上次保存的位置
	const restoredDuration = Number(current?.duration ?? 0)
	const position = restorePos > 0 && progressState.position < 1 ? restorePos : progressState.position
	const duration = progressState.duration > 0 ? progressState.duration : (restorePos > 0 ? restoredDuration : 0)
	const isSliding = useSharedValue(false)
	const progress = useSharedValue(0)
	const min = useSharedValue(0)
	const max = useSharedValue(1)
	const styles = useMemo(() => createStyles(colors, defaultStyles), [colors, defaultStyles])

	const trackElapsedTime = formatSecondsToMinutes(position)
	const trackRemainingTime = formatSecondsToMinutes(Math.max(0, duration - position))

	useEffect(() => {
		if (!isSliding.value) {
			progress.value = duration > 0 ? position / duration : 0
		}
	}, [position, duration])

	const handleSlidingStart = useCallback(() => {
		isSliding.value = true
	}, [])

	// 拖动中把预览位置广播给歌词（松手才真正 seek）
	const publishPreview = useCallback((ratio: number) => {
		if (duration > 0) {
			void import('@/player/seekPreview').then(m => m.setSeekPreview(ratio * duration)).catch(() => undefined)
		}
	}, [duration])

	const handleSlidingComplete = useCallback((value: number) => {
		isSliding.value = false
		// duration 还没回来时不要 seek：clampedValue * 0 = 0，会把歌词与音频一起跳到开头
		if (!(duration > 0)) return
		const clampedValue = Math.min(Math.max(value, 0), 1)
		const newPosition = clampedValue * duration
		progress.value = clampedValue
		// 用 seekWithPreview：内部保持 preview 直到原生 position 追上，
		// 否则清得太早会让歌词先跳回旧行、几秒后再追上（表现为「偏移」）
		void import('@/player/seekPreview')
			.then(m => m.seekWithPreview(newPosition))
			.catch(() => undefined)
		if (onSeek) {
			onSeek(newPosition)
		}
	}, [duration, onSeek])

	const handleValueChange = useCallback((value: number) => {
		progress.value = value
		publishPreview(value)
	}, [progress, publishPreview])

	const renderThumb = useCallback(() => <AnimatedThumb isSliding={isSliding} tint={mac.primary} />, [isSliding, mac.primary])
	const renderBubble = useCallback(() => null, [])

	return (
		<View style={style}>
			<Slider
				progress={progress}
				minimumValue={min}
				maximumValue={max}
				disableTapEvent={false}
				containerStyle={utilsStyles.slider}
				renderThumb={renderThumb}
				renderBubble={renderBubble}
				theme={{
					minimumTrackTintColor: mac.primary,
					maximumTrackTintColor: colors.maximumTrackTintColor,
				}}
				onSlidingStart={handleSlidingStart}
				onValueChange={handleValueChange}
				onSlidingComplete={handleSlidingComplete}
			/>

			<View style={styles.timeRow}>
				<Text style={styles.timeText}>{trackElapsedTime}</Text>

				<Text style={styles.timeText}>
					{'-'} {trackRemainingTime}
				</Text>
			</View>
		</View>
	)
})

const createStyles = (
	colors: ThemeColors,
	defaultStyles: ReturnType<typeof useDefaultStyles>,
) =>
	StyleSheet.create({
	timeRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'baseline',
		marginTop: 20,
	},
	timeText: {
		...defaultStyles.text,
		color: colors.text,
		opacity: 0.75,
		fontSize: fontSize.xs,
		letterSpacing: 0.7,
		fontWeight: '500',
	},
	})
