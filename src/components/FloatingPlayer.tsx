import { PlayPauseButton, SkipToNextButton, SkipToPreviousButton } from '@/components/PlayerControls'
import myTrackPlayer, { trackSourceLoadingStore } from '@/helpers/trackPlayerIndex'
import { unknownTrackImageUri } from '@/constants/images'
import { ThemeColors } from '@/constants/tokens'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { macPalette } from '@/constants/macTokens'
import { useLastActiveTrack } from '@/hooks/useLastActiveTrack'
import { currentArtworkStore } from '@/jk/artworkStore'
import { syncCurrentArtwork } from '@/jk/artworkSync'
import { resolvedFromStore } from '@/player/PlayerStore'
import { sourceLabel } from '@/jk/sourceLabels'
import { useDefaultStyles } from '@/styles'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewProps } from 'react-native'
import { Image } from 'expo-image'
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated'
import { MovingText } from './MovingText'

const fmt = (sec?: number) => {
	const v = Math.max(0, Math.round(Number(sec ?? 0)))
	return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

const srcShort = (id: string) => sourceLabel(id, true)

export const FloatingPlayer = React.memo(({ style }: ViewProps) => {
	const { blurTint, isDark } = useAppTheme()
	const mac = macPalette(!!isDark)
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const styles = useMemo(() => createStyles(colors, defaultStyles, mac.primary), [colors, defaultStyles, mac.primary])
	const router = useRouter()
	const currentMusic = myTrackPlayer.useCurrentMusic()
	const sharedArt = currentArtworkStore.useValue()
	const { position, duration } = myTrackPlayer.useProgress(1)
	const progress = duration > 0 ? Math.min(1, position / duration) : 0
	const lastActiveTrack = useLastActiveTrack()
	const isTrackSourceLoading = trackSourceLoadingStore.useValue() !== null
	const displayedTrack = currentMusic ?? lastActiveTrack
	// 迷你条自己也同步一次：用户可能一直在列表页切歌，从不进播放页
	React.useEffect(() => {
		syncCurrentArtwork(displayedTrack)
	}, [displayedTrack?.id, displayedTrack?.platform])

	const resolvedFrom = resolvedFromStore.useValue()

	const artworkOpacity = useSharedValue(1)
	const prevArtworkRef = useRef(displayedTrack?.artwork)

	useEffect(() => {
		if (displayedTrack?.artwork && displayedTrack.artwork !== prevArtworkRef.current) {
			artworkOpacity.value = 0
			artworkOpacity.value = withTiming(1, { duration: 400 })
			prevArtworkRef.current = displayedTrack.artwork
		}
	}, [displayedTrack?.artwork])

	const artworkAnimatedStyle = useAnimatedStyle(() => ({
		opacity: artworkOpacity.value,
	}))

	const handlePress = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
		router.navigate('/player')
	}, [router])

	if (!displayedTrack) return null

	return (
		<TouchableOpacity onPress={handlePress} activeOpacity={0.9} style={[styles.container, style]}>
			<BlurView intensity={80} tint={blurTint} style={styles.blurContainer}>
				{/* 左段：封面 + 标题/歌手 */}
				<View style={styles.leftSection}>
					<View style={styles.artworkBox}>
						{(sharedArt || displayedTrack.artwork) ? (
							<Image
								contentFit="cover"
								cachePolicy="memory-disk"
								recyclingKey={sharedArt || displayedTrack.artwork}
								source={{ uri: (sharedArt || displayedTrack.artwork) as string }}
								style={StyleSheet.absoluteFill}
							/>
						) : (
							<View style={styles.artworkPlaceholder}>
								<Ionicons name="musical-notes" size={20} color={colors.textMuted} />
							</View>
						)}
					</View>
					<View style={{ flex: 1, justifyContent: 'center' }}>
						<MovingText style={styles.trackTitle} text={displayedTrack.title ?? ''} animationThreshold={18} />
						<Text numberOfLines={1} style={styles.trackArtist}>{displayedTrack.artist ?? ''}</Text>
						{resolvedFrom && resolvedFrom.from !== resolvedFrom.to
							&& (!resolvedFrom.title || resolvedFrom.title === displayedTrack.title) ? (
							<Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
								{srcShort(String(resolvedFrom.from))} → {srcShort(String(resolvedFrom.to))}
							</Text>
						) : null}
					</View>
				</View>

				{/* 中段：进度条在上，时间在下（左右分开放，不贴进度条） */}
				<View style={styles.midSection}>
					<View style={styles.progressBarContainer}>
						<View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
					</View>
					<View style={styles.timeRow}>
						<Text style={styles.progressTime}>{fmt(position)}</Text>
						<Text style={styles.progressTime}>{fmt(duration)}</Text>
					</View>
				</View>

				{/* 右段：播放暂停 + 下一首 */}
				<View style={styles.rightSection}>
					<SkipToPreviousButton iconSize={20} />
					{isTrackSourceLoading ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						<PlayPauseButton iconSize={22} variant="mini" />
					)}
					<SkipToNextButton iconSize={20} disabled={isTrackSourceLoading} />
				</View>
			</BlurView>
		</TouchableOpacity>
	)
})

const createStyles = (
	colors: ThemeColors,
	defaultStyles?: ReturnType<typeof useDefaultStyles>,
	primary?: string,
) =>
	StyleSheet.create({

	leftSection: { flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
	artworkBox: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1C1C1C' },
	artworkPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	midSection: { flex: 1.5, justifyContent: 'center', paddingHorizontal: 8 },
	rightSection: { width: 108, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	progressTime: { color: colors.textMuted, fontSize: 11 },
	timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
	trackArtist: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
	container: {
		borderRadius: 14,
		borderCurve: 'continuous',
		borderColor: colors.border,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: 'hidden',
	},
	blurContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 10,
		paddingVertical: 10,
	},
	trackArtworkContainer: {
		width: 40,
		height: 40,
		borderRadius: 8,
		overflow: 'hidden',
	},
	trackTitleContainer: {
		flex: 1,
		overflow: 'hidden',
		marginLeft: 12,
	},
	trackTitle: {
		...(defaultStyles?.text ?? {}),
		fontSize: 17,
		fontWeight: '500',
	},
	trackControlsContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		columnGap: 18,
		marginRight: 8,
		paddingLeft: 12,
	},
	loadingIndicatorContainer: {
		minWidth: 24,
		minHeight: 24,
		alignItems: 'center',
		justifyContent: 'center',
	},
	progressBarContainer: {
		height: 4,
		backgroundColor: colors.overlaySoft,
		borderRadius: 2,
		overflow: 'hidden',
	},
	progressBar: {
		height: '100%',
		backgroundColor: primary,
		borderRadius: 2,
	},
	})
