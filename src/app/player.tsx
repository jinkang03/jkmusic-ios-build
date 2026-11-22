import { Ionicons } from '@expo/vector-icons'
import Lyric from '@/components/lyric'
import MiniLyric from '@/components/mac/MiniLyric'
import { MovingText } from '@/components/MovingText'
import { PlayerControls } from '@/components/PlayerControls'
import { PlayerProgressBar } from '@/components/PlayerProgressbar'
import { PlayerRepeatToggle } from '@/components/PlayerRepeatToggle'
import { PlayerVolumeBar } from '@/components/PlayerVolumeBar'
import { ShowPlayerListToggle } from '@/components/ShowPlayerListToggle'
import { unknownTrackImageUri } from '@/constants/images'
import { macPalette } from '@/constants/macTokens'
import { bufferingStore } from '@/player/PlayerStore'
import { nowLyricState } from '@/helpers/trackPlayerIndex'
import { fetchLyric } from '@/jk/lyric'
import { resolveArtwork } from '@/jk/artwork'
import { syncCurrentArtwork } from '@/jk/artworkSync'
import { setPendingMusic } from '@/jk/pendingMusic'
import { trackToJk } from '@/jk/adapt'
import { currentArtworkStore } from '@/jk/artworkStore'
import { resolvedFromStore } from '@/player/PlayerStore'
import { logError, logInfo } from '@/helpers/logger'
import { useSetting } from '@/jk/settingsStore'
import { ThemeColors, fontSize, screenPadding } from '@/constants/tokens'
import LyricManager from '@/helpers/lyricManager'
import { isTrialClip, markHandled, switchAwayFromTrial, trialHint, wasHandled } from '@/jk/trial'
import { showToast } from '@/utils/utils'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { getSingerMidBySingerName } from '@/helpers/userApi/getMusicSource'
import { ThemeOverrideProvider, useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { usePlayerBackground } from '@/hooks/usePlayerBackground'
import { useTrackPlayerFavorite } from '@/hooks/useTrackPlayerFavorite'
import PersistStatus from '@/store/PersistStatus'
import { useDefaultStyles } from '@/styles'
import i18n, { tr } from '@/utils/i18n'
import { sourceLabel } from '@/jk/sourceLabels'
import { setTimingClose } from '@/utils/timingClose'
import { Entypo, MaterialCommunityIcons } from '@expo/vector-icons'
import { MenuView } from '@react-native-menu/menu'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	Alert,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	useWindowDimensions,
	View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const LYRIC_DELAY_STEP = 0.5
const LYRIC_DELAY_MIN = -15
const LYRIC_DELAY_MAX = 15

type ArtistDisplayProps = {
	artists: string
	onViewArtist: (artist: string) => void
}

const ArtistDisplay = React.memo(({ artists, onViewArtist }: ArtistDisplayProps) => {
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const styles = React.useMemo(() => createStyles(colors, defaultStyles), [colors, defaultStyles])
	const normalizedArtists = artists.trim()
	const artistArray = React.useMemo(
		() =>
			normalizedArtists
				.split('、')
				.map((artist) => artist.trim())
				.filter(Boolean),
		[normalizedArtists],
	)

	const artistActions = React.useMemo(
		() =>
			artistArray.map((artist) => ({
				id: artist,
				title: artist,
			})),
		[artistArray],
	)

	const handleArtistAction = useCallback(
		({ nativeEvent }: { nativeEvent: { event: string } }) => {
			onViewArtist(nativeEvent.event)
		},
		[onViewArtist],
	)

	const displayArtist = artistArray[0] ?? normalizedArtists
	if (!displayArtist) {
		return null
	}

	if (artistArray.length <= 1) {
		return (
			<TouchableOpacity
				activeOpacity={0.6}
				onPress={() => onViewArtist(displayArtist)}
				accessibilityRole="button"
				accessibilityHint={`View artist ${displayArtist}`}
			>
				<Text numberOfLines={1} style={[styles.trackArtistText, { marginTop: 6 }]}>
					{displayArtist}
				</Text>
			</TouchableOpacity>
		)
	}

	return (
		<MenuView
			title={i18n.t('player.selectArtist')}
			onPressAction={handleArtistAction}
			actions={artistActions}
		>
			<TouchableOpacity
				activeOpacity={0.6}
				accessibilityRole="button"
				accessibilityHint={`View artist ${normalizedArtists}`}
			>
				<Text numberOfLines={1} style={[styles.trackArtistText, { marginTop: 6 }]}>
					{normalizedArtists}
				</Text>
			</TouchableOpacity>
		</MenuView>
	)
})

const srcShort = (id: string) => sourceLabel(id, true)

const PlayerScreenContent = () => {
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const styles = useMemo(() => createStyles(colors, defaultStyles), [colors, defaultStyles])
	const { top, bottom } = useSafeAreaInsets()
	const { width, height } = useWindowDimensions()
	const compact = height - top - bottom < 700
	const { isFavorite, toggleFavorite } = useTrackPlayerFavorite()
	const [showLyrics, setShowLyrics] = useState(false)
	const [showLyricDelayControls, setShowLyricDelayControls] = useState(false)
	const lyricDelaySeconds = PersistStatus.useValue('lyric.delaySeconds', 0) ?? 0
	// 0 = 播放详情，1 = 全屏歌词。由手势跟手驱动，UI 线程动画
	const lyricProgress = useSharedValue(showLyrics ? 1 : 0)
	const gestureStartProgress = useSharedValue(0)
	// dev 验收开关：?action=fullLyric 会置位，便于无点击环境截图全屏歌词
	React.useEffect(() => {
		if ((globalThis as any).__JK_FULL_LYRIC__ === true) {
			setShowLyrics(true)
			lyricProgress.value = 1
		}
	}, [lyricProgress])

	// 播放详情层：上滑时轻微上移并完全淡出（否则会和全屏层叠在一起）
	const detailAnimatedStyle = useAnimatedStyle(() => ({
		opacity: Math.max(0, 1 - lyricProgress.value),
		transform: [{ translateY: -lyricProgress.value * 26 }],
	}))

	// 全屏歌词层：从下方跟手滑入
	const lyricsAnimatedStyle = useAnimatedStyle(() => ({
		opacity: lyricProgress.value,
		transform: [{ translateY: (1 - lyricProgress.value) * Math.max(220, height * 0.35) }],
	}))

	// 歌词区上滑 → 跟手展开全屏歌词
	const openLyricsByGesture = useMemo(
		() =>
			Gesture.Pan()
				.activeOffsetY([-14, 14])
				.failOffsetX([-26, 26])
				.onStart(() => {
					gestureStartProgress.value = lyricProgress.value
				})
				.onUpdate((e) => {
					const next = gestureStartProgress.value + (-e.translationY) / Math.max(240, height * 0.5)
					lyricProgress.value = Math.max(0, Math.min(1, next))
				})
				.onEnd((e) => {
					const shouldOpen = lyricProgress.value > 0.35 || e.velocityY < -800
					lyricProgress.value = withSpring(shouldOpen ? 1 : 0, { damping: 20, stiffness: 190 })
					runOnJS(setShowLyrics)(shouldOpen)
				}),
		[height, lyricProgress, gestureStartProgress],
	)

	const currentActiveTrack = myTrackPlayer.useCurrentMusic()
	const prevTrackRef = useRef(currentActiveTrack)

	useEffect(() => {
		if (currentActiveTrack) {
			prevTrackRef.current = currentActiveTrack
		}
	}, [currentActiveTrack])

	const lastLyricKeyRef = React.useRef<string>('')
	const swappedLyricKeyRef = React.useRef<string>('')
	const trackToDisplay = currentActiveTrack ?? prevTrackRef.current

	const { isDark: playerIsDark } = useAppTheme()
	const mac = macPalette(!!playerIsDark)
	// 封面固定正方形：屏宽 62% 与可用高度 50% 取小，避免被 flex 拉伸或裁切
	const resolvedFrom = resolvedFromStore.useValue()
	const coverSize = Math.min(width * 0.52, Math.max(150, (height - 420) * 0.46))
	const [fallbackArt, setFallbackArt] = React.useState('')
	React.useEffect(() => {
		let cancelled = false
		if (!currentActiveTrack) { setFallbackArt(''); syncCurrentArtwork(null); return }
		syncCurrentArtwork(currentActiveTrack)
		void resolveArtwork(currentActiveTrack).then(url => {
			if (!cancelled) setFallbackArt(url)
		})
		return () => { cancelled = true }
	}, [currentActiveTrack?.id, currentActiveTrack?.platform])
	const artworkUri = trackToDisplay?.artwork || fallbackArt || unknownTrackImageUri
	// 试听检测：音频实际时长明显短于曲目声明时长 → 判定试听并尝试换源
	const buffering = bufferingStore.useValue()
	// 统一歌词抓取：只要当前曲目变化就尝试，覆盖 playnow / 缓存命中 / 详情页点歌所有路径
	// 起播后 2 秒预取下一首（缓存命中也要触发，不再挂在下载成功分支上）
	React.useEffect(() => {
		if (!currentActiveTrack) return
		const timer = setTimeout(() => {
			void import('@/player/prefetch').then(m => m.prefetchNext()).catch(() => undefined)
		}, 2000)
		return () => clearTimeout(timer)
	}, [currentActiveTrack?.id, currentActiveTrack?.platform])

	// 全屏歌词 → 返回紧凑视图时，若歌词被清空则重新拉一次（P122 现象：返回后歌词区变空）
	const prevShowLyrics = React.useRef(showLyrics)
	React.useEffect(() => {
		const was = prevShowLyrics.current
		prevShowLyrics.current = showLyrics
		if (!(was && !showLyrics)) return
		const st: any = LyricManager.getLyricState?.() ?? {}
		const len = (st?.lyrics ?? []).length
		if (len > 0) return
		const t: any = trackToDisplay
		if (!t) return
		void fetchLyric(t)
			.then((res: any) => {
				const lyric = String(res?.lyric ?? '')
				if (!lyric) return
				nowLyricState.setValue(lyric)
				LyricManager.requestRefresh?.()
				logInfo('[lyric] refetch on back len=' + lyric.length)
			})
			.catch((err: any) => logError('[lyric] refetch failed', String(err?.message ?? err)))
	}, [showLyrics])

	React.useEffect(() => {
		const t: any = currentActiveTrack
		if (!t) return
		const key = `${t.platform ?? ''}:${t.id ?? ''}`
		if (!key || key === lastLyricKeyRef.current) return
		lastLyricKeyRef.current = key
		const timer = setTimeout(() => {
			const raw = String(nowLyricState.getValue() ?? '')
			if (raw && raw.length > 20) {
				logInfo('[lyric] skip（已有歌词）', raw.length)
				return
			}
			logInfo('[lyric] fetch start', String(t.title ?? ''))
			void fetchLyric(t as any)
				.then((res: any) => {
					const lyric = String(res?.lyric ?? '')
					if (lyric) {
						nowLyricState.setValue(lyric)
						LyricManager.requestRefresh?.()
						logInfo('[lyric] fetch ok len=' + lyric.length)
					} else {
						logError('[lyric] fetch empty', String(t.title ?? ''))
					}
				})
				.catch((err: any) => logError('[lyric] fetch failed', String(err?.message ?? err)))
		}, 300)
		return () => clearTimeout(timer)
	}, [currentActiveTrack?.id, currentActiveTrack?.platform])

	// 换源完成后（resolvedFromStore 出现 toId）再抓一次歌词：
	// 首次抓取发生在 resolveSource 之前，那时还没换源，酷狗歌会拿到「暂无歌词」。
	React.useEffect(() => {
		const t: any = currentActiveTrack
		if (!t || !resolvedFrom?.toId) return
		const key = `${t.platform ?? ''}:${t.id ?? ''}:${resolvedFrom.to}`
		if (key === swappedLyricKeyRef.current) return
		swappedLyricKeyRef.current = key
		const raw = String(nowLyricState.getValue() ?? '')
		if (raw && raw.length > 20 && !raw.includes('暂无歌词')) {
			logInfo('[lyric] swapped skip（已有真实歌词）')
			return
		}
		logInfo('[lyric] swapped refetch', String(resolvedFrom.from ?? ''), '->', String(resolvedFrom.to ?? ''))
		lastLyricKeyRef.current = ''
		void fetchLyric(t as any)
			.then((res: any) => {
				const lyric = String(res?.lyric ?? '')
				if (lyric) {
					nowLyricState.setValue(lyric)
					LyricManager.requestRefresh?.()
					logInfo('[lyric] swapped ok len=' + lyric.length)
				}
			})
			.catch((err: any) => logError('[lyric] swapped failed', String(err?.message ?? err)))
	}, [resolvedFrom?.toId, resolvedFrom?.to, currentActiveTrack?.id])
	const [bgBlur] = useSetting('playDetail.bgBlur', 1)
	const [zoomActive] = useSetting('playDetail.isZoomActiveLrc', true)
	const { duration: audioDuration } = myTrackPlayer.useProgress(0.5)
	const [trialDetected, setTrialDetected] = React.useState(false)
	React.useEffect(() => {
		const t: any = trackToDisplay
		if (!t || !audioDuration || audioDuration <= 0) return
		const expect = Number(t?.duration ?? 0)
		if (!isTrialClip(audioDuration, expect)) return
		if (wasHandled(t)) return
		markHandled(t)
		setTrialDetected(true)
		console.log(`[jk/trial] detected ${t?.title} audio=${Math.round(audioDuration)}s expect=${expect}s`)
		void (async() => {
			const switched = await switchAwayFromTrial(t)
			if (switched === '__all_trial__') {
				showToast(tr('提示', 'Notice'), tr('该曲各平台均为试听', 'Only previews are available on every platform'), 'info')
			} else if (switched) {
				showToast(tr('提示', 'Notice'), tr(`该曲在当前平台仅提供试听，已切换到 ${switched}`, `Preview only here, switched to ${switched}`), 'info')
			} else {
				showToast(tr('提示', 'Notice'), tr('该曲在当前平台仅提供试听片段', 'Only a preview clip is available on this platform'), 'info')
			}
		})()
	}, [trackToDisplay, audioDuration])

	const artworkSource = useMemo(() => ({ uri: artworkUri }), [artworkUri])
	const { backgroundColor } = usePlayerBackground(artworkUri)
	const artworkFade = useMemo(
		() =>
			[
				`${backgroundColor}00`,
				`${backgroundColor}00`,
				`${backgroundColor}3d`,
				`${backgroundColor}b8`,
				backgroundColor,
			] as const,
		[backgroundColor],
	)

	const artworkTranslateX = useSharedValue(0)

	const artworkAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: artworkTranslateX.value }],
	}))

	const handleSkipNext = useCallback(() => {
		myTrackPlayer.skipToNext()
	}, [])

	const handleSkipPrev = useCallback(() => {
		myTrackPlayer.skipToPrevious()
	}, [])

	const swipeGesture = React.useMemo(
		() =>
			Gesture.Pan()
				.activeOffsetX([-20, 20])
				.failOffsetY([-15, 15])
				.onUpdate((e) => {
					artworkTranslateX.value = e.translationX * 0.25
				})
				.onEnd((e) => {
					if (e.translationX < -width * 0.25) {
						runOnJS(handleSkipNext)()
					} else if (e.translationX > width * 0.25) {
						runOnJS(handleSkipPrev)()
					}
				})
				.onFinalize(() => {
					// Always restore the cover, including cancelled or unsuccessful skips.
					artworkTranslateX.value = withSpring(0, { damping: 15, stiffness: 150, mass: 1 })
				}),
		[artworkTranslateX, handleSkipNext, handleSkipPrev, width],
	)

	// 打开 / 收起全屏歌词（按钮与点击封面用；手势走 openLyricsByGesture）
	const setLyricsOpen = useCallback((open: boolean) => {
		if (!open) setShowLyricDelayControls(false)
		lyricProgress.value = withSpring(open ? 1 : 0, { damping: 20, stiffness: 190 })
		setShowLyrics(open)
	}, [lyricProgress])

	const handleLyricsToggle = useCallback(() => {
		setShowLyrics((prev) => {
			const next = !prev
			if (!next) setShowLyricDelayControls(false)
			lyricProgress.value = withSpring(next ? 1 : 0, { damping: 20, stiffness: 190 })
			return next
		})
	}, [lyricProgress])

	const handleViewArtist = useCallback((artist: string) => {
		const name = String(artist ?? '').trim()
		if (!name || name.includes('未知')) return
		const fallback = () => {
			// 查不到歌手 mid（接口失败/无结果）时退到搜索页，保证「点歌手一定有反应」
			router.push({ pathname: '/(tabs)/search', params: { q: name } } as any)
		}
		getSingerMidBySingerName(name)
			.then((singerMid) => {
				if (singerMid) router.navigate(`/(modals)/${singerMid}` as any)
				else fallback()
			})
			.catch(fallback)
	}, [])

	const handleFavorite = useCallback(() => {
		toggleFavorite()
	}, [toggleFavorite])

	const extractAlbumId = useCallback((artworkUrl: string): string => {
		const regex = /T002R500x500M000(.+)\.jpg/
		const match = artworkUrl.match(regex)
		return match ? match[1] : ''
	}, [])

	const handleShowAlbum = useCallback(() => {
		if (!trackToDisplay?.artwork) return
		const albumId = extractAlbumId(trackToDisplay.artwork)
		router.push(`/(modals)/${albumId}?album=true`)
	}, [trackToDisplay?.artwork, extractAlbumId])

	const handleShowLyrics = handleLyricsToggle

	const handleAddToPlaylist = useCallback(() => {
		const track = trackToDisplay
		if (!track) return
		// 走模块级 pending 传完整对象：URL 参数会丢掉 meta.songmid，加进歌单后无法取流
		setPendingMusic(trackToJk(track as any) as any)
		logInfo('[player] addToPlaylist pending=',
			String((track as any).id ?? ''), 'source=', String((track as any).platform ?? ''))
		router.push('/(modals)/addToPlaylist' as any)
	}, [trackToDisplay])

	const handleDownload = useCallback(() => {
		const track = trackToDisplay
		if (!track) return
		// 手动下载要写进「下载页」（manual 索引），并且可选择音质。
		// 旧实现走 cacheAndImportMusic：只缓存 + 导入本地，下载页看不到。
		const run = async(quality: string) => {
			try {
				const { downloadTrack } = await import('@/jk/downloader')
				await downloadTrack(track, { quality })
			} catch (err) {
				logError('[player] download failed', String((err as any)?.message ?? err))
			}
		}
		Alert.alert(tr('下载音质', 'Download Quality'), tr(`选择「${String((track as any).title ?? '')}」的下载音质`, `Choose quality for "${String((track as any).title ?? '')}"`), [
			{ text: '128k', onPress: () => { void run('128k') } },
			{ text: '320k', onPress: () => { void run('320k') } },
			{ text: 'flac', onPress: () => { void run('flac') } },
			{ text: tr('取消', 'Cancel'), style: 'cancel' },
		])
	}, [trackToDisplay])

	const handleShare = useCallback(async () => {
		try {
			await Share.share({
				title: trackToDisplay?.title,
				message: `歌曲: ${trackToDisplay?.title} by ${trackToDisplay?.artist}`,
				url: trackToDisplay?.url,
			})
		} catch (error) {
			console.error(error.message)
		}
	}, [trackToDisplay])
	const handleTimingClose = useCallback((minutes: number) => {
		setTimingClose(Date.now() + minutes * 60 * 1000)
	}, [])

	const menuActions = React.useMemo(() => {
		const actions = [
			{
				id: 'favorite',
				title: i18n.t('player.like'),
				titleColor: isFavorite ? colors.primary : undefined,
				image: isFavorite ? 'heart.fill' : 'heart',
			},
			{ id: 'album', title: i18n.t('player.showAlbum'), image: 'music.note.list' },
			{ id: 'lyrics', title: i18n.t('player.showLyrics'), image: 'text.quote' },
			{ id: 'playlist', title: i18n.t('player.addToPlaylist'), image: 'plus.circle' },
			{ id: 'share', title: i18n.t('player.share'), image: 'square.and.arrow.up' },
			{
				id: 'timing',
				title: i18n.t('player.closeAfter'),
				image: 'timer',
				subactions: [
					{ id: 'timing_10', title: '10 ' + i18n.t('player.minutes') },
					{ id: 'timing_15', title: '15 ' + i18n.t('player.minutes') },
					{ id: 'timing_20', title: '20 ' + i18n.t('player.minutes') },
					{ id: 'timing_30', title: '30 ' + i18n.t('player.minutes') },
					{ id: 'timing_cus', title: i18n.t('player.custom') },
				],
			},
		]
		if (trackToDisplay?.platform !== 'local') {
			actions.splice(4, 0, {
				id: 'download',
				title: i18n.t('player.download'),
				image: 'arrow.down.circle',
			})
		}
		return actions
	}, [colors.primary, isFavorite, trackToDisplay?.platform])
	useEffect(() => {
		if (showLyrics) {
			activateKeepAwakeAsync()
		} else {
			deactivateKeepAwake()
		}

		return () => {
			deactivateKeepAwake() // 清理函数，确保组件卸载时停用屏幕常亮
		}
	}, [showLyrics])
	const handleLyricsFontSizeDecrease = useCallback(() => {
		const currentFontSize = PersistStatus.get('lyric.detailFontSize') ?? 1
		PersistStatus.set('lyric.detailFontSize', currentFontSize - 1 < 0 ? 0 : currentFontSize - 1)
	}, [])

	const handleLyricsFontSizeIncrease = useCallback(() => {
		const currentFontSize = PersistStatus.get('lyric.detailFontSize') ?? 1
		PersistStatus.set('lyric.detailFontSize', currentFontSize + 1 > 3 ? 3 : currentFontSize + 1)
	}, [])
	function formatLyricDelay(delaySeconds: number): string {
		const normalized = Math.abs(delaySeconds) < 0.05 ? 0 : delaySeconds
		const rounded = Math.round(normalized * 10) / 10
		const prefix = rounded > 0 ? '+' : ''
		return `${prefix}${rounded.toFixed(1)}s`
	}
	function updateLyricDelay(nextDelaySeconds: number): void {
		const normalized = Math.round(nextDelaySeconds * 10) / 10
		const clamped = Math.max(LYRIC_DELAY_MIN, Math.min(LYRIC_DELAY_MAX, normalized))
		PersistStatus.set('lyric.delaySeconds', clamped)
		LyricManager.refreshLyric().catch((err) => {
			console.error('refresh lyric after delay changed failed', err)
		})
	}
	function handleLyricDelayDecrease(): void {
		const currentDelay = PersistStatus.get('lyric.delaySeconds') ?? 0
		updateLyricDelay(currentDelay - LYRIC_DELAY_STEP)
	}
	function handleLyricDelayIncrease(): void {
		const currentDelay = PersistStatus.get('lyric.delaySeconds') ?? 0
		updateLyricDelay(currentDelay + LYRIC_DELAY_STEP)
	}
	function handleLyricDelayReset(): void {
		updateLyricDelay(0)
	}
	function toggleLyricDelayControls(): void {
		setShowLyricDelayControls((prev) => !prev)
	}
	function setCustomTimingClose() {
		Alert.prompt(
			i18n.t('player.setTimingClose'),
			i18n.t('player.inputMinutes'),
			[
				{
					text: i18n.t('player.cancel'),
					style: 'cancel',
				},
				{
					text: i18n.t('player.confirm'),
					onPress: (minutes) => {
						if (minutes && !isNaN(Number(minutes))) {
							const milliseconds = Number(minutes) * 60 * 1000
							setTimingClose(Date.now() + milliseconds)
						} else {
							Alert.alert(i18n.t('player.error.title'), i18n.t('player.error.minutesErrorMessage'))
						}
					},
				},
			],
			'plain-text',
		)
	}

	return (
		<>
			<StatusBar style="light" />
			<View style={[styles.screen, { backgroundColor: 'transparent' }]}>
				{/* 背景：封面铺满 + 模糊 + 压暗，保证文字对比度（保持原样，不叠自定义壁纸） */}
				<View style={StyleSheet.absoluteFill} pointerEvents="none">
					{/* 无封面时用实色兜底：播放页不参与壁纸，避免透出下层壁纸 */}
					{artworkUri ? (
						<Image source={{ uri: artworkUri }} contentFit="cover" style={StyleSheet.absoluteFill} />
					) : (
						<View style={[StyleSheet.absoluteFill, { backgroundColor: playerIsDark ? '#000000' : '#FFFFFF' }]} />
					)}
					<BlurView intensity={Math.round(Number(bgBlur) * 100)} tint="dark" style={StyleSheet.absoluteFill} />
				</View>
				{/* 顶部栏：收起 / 收藏 / 更多（更多沿用右侧原菜单，此处只放收起与收藏） */}
				<View style={[styles.topBar, { paddingTop: top, height: top + 48 }]} pointerEvents="box-none">
					<TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel={tr('收起', 'Collapse')}>
						<Ionicons name="chevron-down" size={26} color={colors.text} />
					</TouchableOpacity>
					<View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
						<TouchableOpacity onPress={handleFavorite} hitSlop={12} accessibilityLabel={tr('收藏', 'Favorite')}>
							<Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? mac.primary : colors.text} />
						</TouchableOpacity>
					</View>
				</View>
				{/* 播放详情层（上滑时淡出） */}
					<Animated.View
						style={[styles.playerLayout, detailAnimatedStyle]}
						pointerEvents={showLyrics ? 'none' : 'auto'}
					>
						<View style={styles.artworkRegion}>
							<View style={styles.artworkCanvas}>
								<GestureDetector gesture={swipeGesture}>
									<Animated.View style={[styles.artworkSquare, { width: coverSize, height: coverSize }, artworkAnimatedStyle]}>
										<TouchableOpacity
											style={styles.artworkTouchable}
											activeOpacity={1}
											onPress={handleLyricsToggle}
											accessibilityRole="button"
											accessibilityLabel={i18n.t('player.showLyrics')}
										>
											<Image
												contentFit="cover"
												placeholderContentFit="cover"
												placeholder={unknownTrackImageUri}
												cachePolicy="memory-disk"
												priority="high"
												transition={200}
												recyclingKey={artworkUri}
												source={artworkSource}
												style={styles.artworkImage}
											/>
										</TouchableOpacity>
									</Animated.View>
								</GestureDetector>
								{/* artworkFade：原来用于封面铺满时的淡出，改成方块封面后它只会盖住背景，已删除 */}

							</View>
						</View>
						{buffering ? (
							<View style={{ alignItems: 'center', marginTop: 8 }}>
								<Text style={{ color: mac.primary, fontSize: 12 }}>
									{tr('缓冲中…', 'Buffering…')} {typeof buffering.percent === 'number' ? `${buffering.percent}%` : ''}
								</Text>
							</View>
						) : null}
						{/* 紧凑歌词区：当前行 ± 2，点行可 seek；上滑跟手展开全屏歌词 */}
						<GestureDetector gesture={openLyricsByGesture}>
							<View style={{ flex: 1, minHeight: 120, marginTop: 12 }}>
								<MiniLyric />
							</View>
						</GestureDetector>
						<View style={[styles.controlsPanel, { paddingBottom: Math.max(bottom, 16) }]}>
							<View>
								<View style={{ minHeight: 60 }}>
									<View
										style={{
											flexDirection: 'row',
											justifyContent: 'space-between',
											alignItems: 'center',
										}}
									>
										{/* Track title */}
										<View style={styles.trackTitleContainer}>
											<MovingText
												text={trackToDisplay?.title ?? ''}
												animationThreshold={30}
												style={styles.trackTitleText}
											/>
										</View>

										{/* Favorite button icon */}
										<MenuView
											title={i18n.t('player.songOptions')}
											onPressAction={({ nativeEvent }) => {
												switch (nativeEvent.event) {
													case 'favorite':
														handleFavorite()
														break
													case 'album':
														handleShowAlbum()
														break
													case 'lyrics':
														handleShowLyrics()
														break
													case 'playlist':
														handleAddToPlaylist()
														break
													case 'download':
														handleDownload()
														break
													case 'share':
														handleShare()
														break
													case 'timing_10':
														handleTimingClose(10)
														break
													case 'timing_15':
														handleTimingClose(15)
														break
													case 'timing_20':
														handleTimingClose(20)
														break
													case 'timing_30':
														handleTimingClose(30)
														break
													case 'timing_cus':
														setCustomTimingClose()
														break
												}
											}}
											actions={menuActions}
										>
											<TouchableOpacity
												style={styles.menuButton}
												hitSlop={8}
												accessibilityRole="button"
												accessibilityLabel={i18n.t('player.songOptions')}
											>
												<Entypo name="dots-three-horizontal" size={18} color={colors.icon} />
											</TouchableOpacity>
										</MenuView>
									</View>

									{/* Track artist */}
									{trackToDisplay?.artist ? (
										<ArtistDisplay
											artists={trackToDisplay.artist}
											onViewArtist={handleViewArtist}
										/>
									) : null}
									{trackToDisplay?.album ? (
										<Text numberOfLines={1} style={[styles.trackArtistText, { marginTop: 2, opacity: 0.6 }]}>
											{trackToDisplay.album}
										</Text>
									) : null}
									{resolvedFrom && resolvedFrom.from !== resolvedFrom.to
										&& (!resolvedFrom.title || resolvedFrom.title === trackToDisplay?.title) ? (
										<Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
											音源：{srcShort(String(resolvedFrom.from))} → {srcShort(String(resolvedFrom.to))}
										</Text>
									) : null}
									{trialDetected ? (
										<Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
											{trialHint(Number(trackToDisplay?.duration ?? 0))}
										</Text>
									) : null}
								</View>

								<PlayerProgressBar style={{ marginTop: compact ? 18 : 24 }} />

								<PlayerControls style={{ marginTop: compact ? 20 : 28 }} />
							</View>

							<PlayerVolumeBar
								style={{ marginTop: compact ? 24 : 40, marginBottom: compact ? 18 : 28 }}
							/>

							<View style={styles.container}>
								<View style={styles.leftItem}>
									<MaterialCommunityIcons
										name="tooltip-minus-outline"
										size={27}
										color={colors.text}
										onPress={handleLyricsToggle}
										style={{ marginBottom: 2 }}
									/>
								</View>
								<View style={styles.centeredItem}>
									<PlayerRepeatToggle size={30} style={{ marginBottom: 6 }} />
								</View>
								<View style={styles.rightItem}>
									<ShowPlayerListToggle size={30} style={{ marginBottom: 6 }} />
								</View>
							</View>
						</View>
					</Animated.View>
				{/* 全屏歌词层（跟手转场，位于上层） */}
					<Animated.View
						pointerEvents={showLyrics ? 'auto' : 'none'}
						style={[
							styles.lyricsLayout,
							StyleSheet.absoluteFill,
							{ paddingTop: top + 40, paddingBottom: Math.max(bottom, 16) },
							lyricsAnimatedStyle,
						]}
					>
						<View style={styles.lyricContainer}>
							<Lyric
								onTurnPageClick={handleLyricsToggle}
								scrollEnabled={showLyrics}
								onRequestClose={() => setLyricsOpen(false)}
							/>
						</View>
						<View style={styles.lyricToolbar}>
							<TouchableOpacity
								style={styles.lyricToolbarButton}
								onPress={handleLyricsToggle}
								accessibilityRole="button"
								accessibilityLabel={i18n.t('player.backToPlayer')}
							>
								<MaterialCommunityIcons
									name="tooltip-minus-outline"
									size={27}
									color={colors.text}
									accessible={false}
								/>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.lyricToolbarButton}
								onPress={handleLyricsFontSizeDecrease}
								accessibilityRole="button"
								accessibilityLabel={i18n.t('player.decreaseLyricFontSize')}
							>
								<MaterialCommunityIcons
									name="format-font-size-decrease"
									size={30}
									color={colors.text}
									accessible={false}
								/>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.lyricToolbarButton}
								onPress={handleLyricsFontSizeIncrease}
								accessibilityRole="button"
								accessibilityLabel={i18n.t('player.increaseLyricFontSize')}
							>
								<MaterialCommunityIcons
									name="format-font-size-increase"
									size={30}
									color={colors.text}
									accessible={false}
								/>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.lyricToolbarButton}
								onPress={toggleLyricDelayControls}
								accessibilityRole="button"
								accessibilityLabel={i18n.t('player.lyricDelay')}
								accessibilityState={{ expanded: showLyricDelayControls }}
							>
								<MaterialCommunityIcons
									name="timer-outline"
									size={26}
									color={showLyricDelayControls ? colors.primary : colors.text}
									accessible={false}
								/>
							</TouchableOpacity>
						</View>
						{showLyricDelayControls ? (
							<View style={styles.lyricDelayContainer}>
								<TouchableOpacity
									style={styles.delayAdjustButton}
									onPress={handleLyricDelayDecrease}
									accessibilityRole="button"
									accessibilityLabel={i18n.t('player.decreaseLyricDelay')}
								>
									<Text style={styles.delayAdjustText} numberOfLines={1} adjustsFontSizeToFit>
										-0.5s
									</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={styles.delayValueButton}
									onPress={handleLyricDelayReset}
									accessibilityRole="button"
									accessibilityLabel={i18n.t('player.resetLyricDelay')}
									accessibilityValue={{ text: formatLyricDelay(lyricDelaySeconds) }}
								>
									<Text style={styles.delayLabel} numberOfLines={1} adjustsFontSizeToFit>
										{i18n.t('player.lyricDelay')}
									</Text>
									<Text style={styles.delayValueText}>{formatLyricDelay(lyricDelaySeconds)}</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={styles.delayAdjustButton}
									onPress={handleLyricDelayIncrease}
									accessibilityRole="button"
									accessibilityLabel={i18n.t('player.increaseLyricDelay')}
								>
									<Text style={styles.delayAdjustText} numberOfLines={1} adjustsFontSizeToFit>
										+0.5s
									</Text>
								</TouchableOpacity>
							</View>
						) : null}
					</Animated.View>
				<DismissPlayerSymbol />
			</View>
		</>
	)
}

const PlayerScreen = () => {
	return (
		<ThemeOverrideProvider resolvedTheme="dark">
			{/* 功能页统一 dark 状态栏，播放页是深色背景，状态栏要回到浅色文字 */}
			<StatusBar style="light" />
			<PlayerScreenContent />
		</ThemeOverrideProvider>
	)
}

const DismissPlayerSymbol = React.memo(() => {
	const colors = useThemeColors()
	const { top } = useSafeAreaInsets()

	return (
		<View
			pointerEvents="none"
			style={{
				position: 'absolute',
				zIndex: 2,
				top: top + 8,
				left: 0,
				right: 0,
				flexDirection: 'row',
				justifyContent: 'center',
			}}
		>
			<View
				style={{
					width: 44,
					height: 5,
					borderRadius: 3,
					backgroundColor: colors.dismissBar,
					opacity: 0.7,
				}}
			/>
		</View>
	)
})

const createStyles = (colors: ThemeColors, defaultStyles: ReturnType<typeof useDefaultStyles>) =>
	StyleSheet.create({
		menuButton: {
			width: 32,
			height: 32,
			borderRadius: 16,
			backgroundColor: colors.overlaySoft,
			justifyContent: 'center',
			alignItems: 'center',
		},
		screen: {
			flex: 1,
		},
		topBar: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			paddingHorizontal: 20,
			height: 48,
			zIndex: 10,
		},
		playerLayout: {
			flex: 1,
		},
		lyricsLayout: {
			flex: 1,
			paddingHorizontal: screenPadding.horizontal,
		},
		artworkRegion: {
			// 不参与 flex 分配：封面按自身尺寸占位，剩余高度全部留给歌词
			alignItems: 'center',
			justifyContent: 'center',
			paddingTop: 12,
			paddingBottom: 8,
		},
		artworkCanvas: {
			// 流式布局：封面在文档流里居中，不再 absolute 撑满（原来会在下方留大块空白）
			alignItems: 'center',
			justifyContent: 'center',
			overflow: 'hidden',
			marginTop: 8,
		},
		artworkSquare: {
			aspectRatio: 1,
			borderRadius: 12,
			overflow: 'hidden',
			backgroundColor: '#00000033',
		},
		artworkImageContainer: {
			flex: 1,
		},
		artworkTouchable: {
			width: '100%',
			height: '100%',
		},
		artworkImage: {
			width: '100%',
			height: '100%',
			backgroundColor: 'transparent',
		},
		topScrim: {
			position: 'absolute',
			top: 0,
			left: 0,
			right: 0,
		},
		controlsPanel: {
			flexShrink: 0,
			zIndex: 1,
			marginTop: 'auto',
			paddingHorizontal: screenPadding.horizontal,
		},
		trackTitleContainer: {
			flex: 1,
			marginRight: 16,
			overflow: 'hidden',
		},
		trackTitleText: {
			...defaultStyles.text,
			fontSize: 22,
			fontWeight: '700',
		},
		trackArtistText: {
			...defaultStyles.text,
			fontSize: fontSize.base,
			opacity: 0.8,
			maxWidth: '90%',
		},
		lyricText: {
			...defaultStyles.text,
			textAlign: 'center',
		},
		lyric: {},
		container: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			paddingHorizontal: 16,
		},
		leftItem: {
			flex: 1,
			alignItems: 'flex-start',
		},
		centeredItem: {
			flex: 1,
			alignItems: 'center',
		},
		rightItem: {
			flex: 1,
			alignItems: 'flex-end',
		},
		lyricToolbar: {
			width: '100%',
			flexDirection: 'row',
			alignItems: 'center',
			flexShrink: 0,
		},
		lyricToolbarButton: {
			flex: 1,
			minWidth: 0,
			minHeight: 44,
			alignItems: 'center',
			justifyContent: 'center',
			borderRadius: 8,
		},
		lyricDelayContainer: {
			width: '100%',
			flexDirection: 'row',
			alignItems: 'stretch',
			flexShrink: 0,
			columnGap: 8,
			marginTop: 8,
		},
		delayAdjustButton: {
			flex: 1,
			minWidth: 0,
			minHeight: 44,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: colors.overlaySoft,
			paddingVertical: 8,
			paddingHorizontal: 8,
			borderRadius: 8,
		},
		delayAdjustText: {
			...defaultStyles.text,
			fontSize: 14,
			fontWeight: '600',
		},
		delayValueButton: {
			flex: 1.6,
			minWidth: 0,
			minHeight: 44,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: colors.overlaySoft,
			paddingVertical: 8,
			paddingHorizontal: 8,
			borderRadius: 8,
		},
		delayLabel: {
			...defaultStyles.text,
			fontSize: 11,
			opacity: 0.8,
		},
		delayValueText: {
			...defaultStyles.text,
			fontSize: 15,
			fontWeight: '700',
		},
		lyricContainer: {
			flex: 1,
		},
	})

export default PlayerScreen
