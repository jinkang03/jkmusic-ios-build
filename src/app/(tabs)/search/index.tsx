import SongListView from '@/components/mac/SongListView'
import { useAppTheme } from '@/hooks/useAppTheme'
import { getSetting, setSetting, useSetting } from '@/jk/settingsStore'
import { logInfo } from '@/helpers/logger'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { ThemeColors } from '@/constants/tokens'
import { useThemeColors } from '@/hooks/useAppTheme'
import searchAll from '@/helpers/searchAll'
import i18n from '@/utils/i18n'
import debounce from 'lodash/debounce'
import { useFocusEffect, useLocalSearchParams, useSegments } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	Animated,
	Dimensions,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
	TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Track } from '@/player/types'

type SearchType = 'songs' | 'artists'

// 桌面版源胶囊（聚合 = 全源并行）
const SOURCE_PILLS: Array<{ id: string, label: string }> = [
	{ id: 'kw', label: '酷我' },
	{ id: 'kg', label: '酷狗' },
	{ id: 'tx', label: '企鹅' },
	{ id: 'wy', label: '网易' },
	{ id: 'mg', label: '咪咕' },
	{ id: 'all', label: '聚合搜索' },
]

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SEGMENT_WIDTH = (SCREEN_WIDTH - 32 - 4) / 2 // 32 for padding, 4 for container padding

const SearchlistsScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const mac = macPalette(!!isDark)
	const styles = useMemo(() => createStyles(colors), [colors])
	// const router = useRouter()
	const [searchResults, setSearchResults] = useState<Track[]>([])
	const [page, setPage] = useState(1)
	const [isLoading, setIsLoading] = useState(false)
	const [hasMore, setHasMore] = useState(true)
	const searchRequestRef = useRef(0)
	const [searchType, setSearchType] = useState<SearchType>('songs')
	const [activeSourcePill, setActiveSourcePill] = useState<string>('all')
	const [showHot] = useSetting('search.isShowHotSearch', true)
	const [showHistory] = useSetting('search.isShowHistorySearch', true)
	const [autoFocus] = useSetting('search.isFocusSearchBox', false)
	const [autoClearInput] = useSetting('odc.isAutoClearSearchInput', false)
	const [autoClearList] = useSetting('odc.isAutoClearSearchList', false)
	const [hotWords, setHotWords] = useState<string[]>([])
	const [hotFailed, setHotFailed] = useState(false)
	const [hotTick, setHotTick] = useState(0)
	const [history, setHistory] = useState<string[]>(() => { const raw = getSetting<any>('search.history', []); return Array.isArray(raw) ? raw : [] })
	// 深链参数 ?q= 仅触发一次搜索（jkmusic://search?q=周杰伦），之后仍由搜索框驱动
	const routeParams = useLocalSearchParams<{ q?: string }>()
	const initialQuery = typeof routeParams.q === 'string' ? routeParams.q : ''
	const initialQueryApplied = useRef(false)
	const [resultsFromDeepLink, setResultsFromDeepLink] = useState<Track[]>([])
	const slideAnim = useRef(new Animated.Value(0)).current
	const [search, setSearch] = useState('')

	const fetchSearchResults = useCallback(
		async (currentPage: number) => {
			if (!search) {
				return
			}

			const requestId = ++searchRequestRef.current
			setIsLoading(true)

			try {
				let data: Track[] = []
				let moreResults = false
				if (activeSourcePill === 'all') {
					const res = await searchAll(search, currentPage, searchType)
					data = res.data
					moreResults = res.hasMore
				} else {
					const { searchBySource } = await import('@/jk/musicSdk')
					const { jkToTrack } = await import('@/jk/adapt')
					const list = await searchBySource(activeSourcePill as any, search, currentPage)
					data = (list ?? []).map((m: any) => jkToTrack(m))
					moreResults = (list ?? []).length >= 20
				}

				if (requestId === searchRequestRef.current) {
					setHasMore(moreResults)
					setSearchResults((prevResults) => {
						const newResults = currentPage === 1 ? data : [...prevResults, ...data]

						return newResults
					})

					setPage(currentPage)
				}
			} catch (error) {
				console.error('Error fetching search results:', error)
			} finally {
				if (requestId === searchRequestRef.current) {
					setIsLoading(false)
				}
			}
		},
		[search, searchType, activeSourcePill],
	)
	// 深链带 query 时，直接跑一次搜索填充结果（不依赖原生搜索框的文本状态）
	useEffect(() => {
		if (!initialQuery || initialQueryApplied.current) return
		initialQueryApplied.current = true
		let cancelled = false
		;(async() => {
			try {
				setIsLoading(true)
				const { data, hasMore: moreResults } = await searchAll(initialQuery, 1, 'songs')
				if (!cancelled) {
					setResultsFromDeepLink(data)
					setSearchResults(data)
					setHasMore(moreResults)
					setPage(1)
				}
			} catch (err) {
				console.log('[search] deep link query failed', initialQuery, err)
			} finally {
				if (!cancelled) setIsLoading(false)
			}
		})()
		return () => { cancelled = true }
	}, [initialQuery])

	const debouncedFetchSearchResults = useRef(
		debounce((currentPage: number) => {
			fetchSearchResults(currentPage)
		}, 300),
	).current

	useEffect(() => {
		debouncedFetchSearchResults.cancel()
	}, [search])

	// dev 命令通道：深链设置源胶囊/触发提交（不依赖点击）
	React.useEffect(() => {
		const g: any = globalThis
		const timer = setInterval(() => {
			const cmd = g.__jkSearchCmd
			if (!cmd) return
			g.__jkSearchCmd = null
			if (cmd.pill) setActiveSourcePill(cmd.pill)
			if (cmd.q !== undefined) {
				setSearch(String(cmd.q))
				if (cmd.kind === 'searchSubmit') rememberHistory(cmd.q)
			}
		}, 400)
		return () => clearInterval(timer)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// 切换音源：清空结果、重置分页、作废在途请求，然后重查
	useEffect(() => {
		searchRequestRef.current++
		setSearchResults([])
		setPage(1)
		setHasMore(true)
		if (search) void fetchSearchResults(1)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeSourcePill])
	useEffect(() => {
		setPage(1)
		setHasMore(true)
		setSearchResults([])
		searchRequestRef.current++

		if (search === '') {
			setIsLoading(false)
			setHasMore(false)
			setSearchResults([])
		} else if (search) {
			fetchSearchResults(1)
		}

		return () => {
			searchRequestRef.current++
		}
	}, [search, searchType, fetchSearchResults])

	const handleLoadMore = useCallback(() => {
		if (!isLoading && hasMore && search) {
			fetchSearchResults(page + 1)
		}
	}, [isLoading, hasMore, page, fetchSearchResults, search])

	React.useEffect(() => {
		let cancelled = false
		void (async() => {
			try {
				const { getHotSearch } = await import('@/jk/musicSdk')
				const words = await getHotSearch()
				if (!cancelled) { setHotWords(words); setHotFailed(words.length === 0) }
			} catch (err) {
				if (!cancelled) setHotFailed(true)
				logInfo('[search] 热搜失败', String((err as any)?.message ?? err))
			}
		})()
		return () => { cancelled = true }
	}, [hotTick])

	const rememberHistory = (kw: string) => {
		if (!kw.trim()) return
		setHistory(prev => {
			const next = [kw, ...prev.filter(h => h !== kw)].slice(0, 20)
			setSetting('search.history', next)
			return next
		})
	}

	// 失去焦点（切 tab）时按开关清理——tab 页不会卸载，useEffect cleanup 永远不跑
	useFocusEffect(React.useCallback(() => {
		return () => {
			// 先把状态记进全局标记再清空，供 stress 场景判定（不受点击能力限制）
			const g: any = globalThis
			g.__jkSearchBlur = {
				at: Date.now(), input: search, listLen: searchResults.length,
				cleared: { input: autoClearInput, list: autoClearList },
			}
			logInfo(`[search] blur autoclear input=${autoClearInput} list=${autoClearList}`)
			if (autoClearInput) setSearch('')
			if (autoClearList) setSearchResults([])
		}
	}, [autoClearInput, autoClearList]))

	const handleSearchTypeChange = (type: SearchType) => {
		const toValue = type === 'songs' ? 0 : SEGMENT_WIDTH
		Animated.spring(slideAnim, {
			toValue,
			useNativeDriver: true,
			tension: 100,
			friction: 10,
		}).start()
		setSearchType(type)
	}

	return (
		<SafeAreaView style={[styles.safeArea, { backgroundColor: mac.bg }]} edges={['top', 'left', 'right']}>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 8 }}>
				<Text style={{ color: mac.textStrong, fontSize: macFont.display, fontWeight: '700' }}>搜索</Text>
				{/* 自绘胶囊搜索框：高 44，左放大镜，右侧清除 */}
				<View style={{
					flexDirection: 'row', alignItems: 'center', gap: 8,
					height: 44, borderRadius: macRadius.pill, backgroundColor: mac.fillSubtle,
					paddingHorizontal: 14, marginTop: 12,
				}}>
					<Ionicons name="search" size={18} color={mac.textMuted} />
					<TextInput
						value={search}
						onChangeText={setSearch}
						placeholder="在线搜索歌曲或歌手"
						autoFocus={Boolean(autoFocus)}
						placeholderTextColor={mac.textMuted}
						returnKeyType="search"
						style={{ flex: 1, color: mac.text, fontSize: macFont.body, padding: 0 }}
					/>
					{search.length > 0 ? (
						<Pressable onPress={() => setSearch('')} hitSlop={8}>
							<Ionicons name="close-circle" size={18} color={mac.textMuted} />
						</Pressable>
					) : null}
				</View>
			</View>

			{/* 源胶囊行（桌面版：酷我/酷狗/企鹅/网易/咪咕/聚合） */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flexGrow: 0, flexShrink: 0, marginTop: 10 }}
				contentContainerStyle={{ paddingHorizontal: macSpace.pageX, gap: 8 }}
			>
				{SOURCE_PILLS.map(pill => {
					const active = pill.id === activeSourcePill
					return (
						<Pressable
							key={pill.id}
							onPress={() => setActiveSourcePill(pill.id)}
							style={{
								paddingHorizontal: 14,
								paddingVertical: 6,
								borderRadius: macRadius.pill,
								borderWidth: active ? 1 : 0.5,
								borderColor: active ? mac.primary : mac.divider,
								backgroundColor: active ? 'transparent' : mac.fillSubtle,
							}}
						>
							<Text style={{ color: active ? mac.primary : mac.text, fontSize: macFont.caption }}>{pill.label}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			<View style={styles.contentContainer}>
				<View style={styles.segmentedControlContainer}>
					<View style={styles.segmentedControl}>
						<Animated.View
							style={[
								styles.activeSegment,
								{ position: 'absolute', width: SEGMENT_WIDTH, transform: [{ translateX: slideAnim }] },
							]}
						/>
						<Pressable
							style={[styles.segment, { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]}
							onPress={() => handleSearchTypeChange('songs')}
						>
							<Text style={[styles.segmentText, searchType === 'songs' && styles.activeSegmentText]}>
								{i18n.t('find.songs')}
							</Text>
						</Pressable>
						<Pressable
							style={[styles.segment, { borderTopRightRadius: 8, borderBottomRightRadius: 8 }]}
							onPress={() => handleSearchTypeChange('artists')}
						>
							<Text style={[styles.segmentText, searchType === 'artists' && styles.activeSegmentText]}>
								{i18n.t('find.artists')}
							</Text>
						</Pressable>
					</View>
				</View>

				{(showHot || showHistory) && !search ? (
					<View style={{ marginHorizontal: macSpace.pageX, marginTop: 12, borderRadius: macRadius.card, backgroundColor: mac.fillSubtle, padding: 14 }}>
						{showHot ? (
							<View style={{ marginBottom: showHistory ? 14 : 0 }}>
								<Text style={{ color: mac.textStrong, fontSize: macFont.body, fontWeight: '600', marginBottom: 8 }}>热门搜索</Text>
								{hotWords.length === 0 ? (
									<Pressable onPress={() => { setHotFailed(false); setHotTick(v => v + 1) }} disabled={!hotFailed}>
										<Text style={{ color: hotFailed ? mac.primary : mac.textMuted, fontSize: macFont.caption }}>
											{hotFailed ? '加载失败，点击重试' : '暂无热门搜索'}
										</Text>
									</Pressable>
								) : (
									<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
										{hotWords.map(w => (
											<Pressable key={w} onPress={() => { setSearch(w); rememberHistory(w) }} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: macRadius.pill, borderWidth: 0.5, borderColor: mac.divider }}>
												<Text style={{ color: mac.text, fontSize: macFont.caption }}>{w}</Text>
											</Pressable>
										))}
									</View>
								)}
							</View>
						) : null}
						{showHistory ? (
							<View>
								<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
									<Text style={{ color: mac.textStrong, fontSize: macFont.body, fontWeight: '600' }}>历史搜索</Text>
									{history.length > 0 ? (
										<Pressable onPress={() => setHistory([])} hitSlop={8}>
											<Text style={{ color: mac.textMuted, fontSize: macFont.caption }}>清空</Text>
										</Pressable>
									) : null}
								</View>
								{history.length === 0 ? (
									<Text style={{ color: mac.textMuted, fontSize: macFont.caption }}>暂无历史</Text>
								) : (
									<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
										{history.map(h => (
											<Pressable key={h} onPress={() => setSearch(h)} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: macRadius.pill, borderWidth: 0.5, borderColor: mac.divider }}>
												<Text style={{ color: mac.text, fontSize: macFont.caption }}>{h}</Text>
											</Pressable>
										))}
									</View>
								)}
							</View>
						) : null}
					</View>
				) : null}

				{/* 结果：五列 SongRow，点行播放（当前结果集作为队列） */}
				<SongListView
					showActions
					onTrackPress={() => rememberHistory(search)}
					tracks={searchResults as any}
					queueId={`search_${searchType}`}
					emptyText={search ? '没有搜索结果' : '输入关键词开始搜索'}
				/>
			</View>
		</SafeAreaView>
	)
}

const createStyles = (colors: ThemeColors) =>
	StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	safeArea: {
		flex: 1,
		backgroundColor: colors.background,
	},
	contentContainer: {
		flex: 1,
		backgroundColor: colors.background,
		paddingTop: 8,
	},
	segmentedControlContainer: {
		paddingHorizontal: 16,
		marginTop: 0,
		paddingBottom: 4,
	},
	segmentedControl: {
		flexDirection: 'row',
		backgroundColor: colors.surfaceMuted,
		borderRadius: 8,
		padding: 2,
		position: 'relative',
	},
	segment: {
		flex: 1,
		paddingVertical: 6,
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 1,
	},
	activeSegment: {
		backgroundColor: colors.surfaceElevated,
		borderRadius: 6,
		shadowColor: colors.shadow,
		shadowOffset: {
			width: 0,
			height: 1,
		},
		shadowOpacity: 0.15,
		shadowRadius: 2,
		elevation: 2,
		position: 'absolute',
		top: 2,
		bottom: 2,
		zIndex: 0,
	},
	segmentText: {
		fontSize: 15,
		color: colors.textMuted,
	},
	activeSegmentText: {
		color: colors.primary,
		fontWeight: '500',
	},
	})

export default SearchlistsScreen
