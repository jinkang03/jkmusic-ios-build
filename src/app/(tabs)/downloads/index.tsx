/**
 * 下载页：把缓存目录变成用户可见的资产。
 * 数据源就是 Documents/musicCache 里的真实文件（先下载后播放策略的副产物）。
 */
import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import * as FS from 'expo-file-system/legacy'
import StateView from '@/components/mac/StateView'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { glass } from '@/constants/glass'
import { useAppTheme } from '@/hooks/useAppTheme'
import { getSetting, setSetting, useSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'
import { readCacheIndex, removeCacheIndexEntry } from '@/player/CacheManager'
import { normalizeQuality } from '@/jk/downloader'
import { downloadTasksStore } from '@/jk/downloadTasksStore'
import { tr } from '@/utils/i18n'
import { fileUriFromPath } from '@/helpers/localFile'

// 筛选项用 id 判断，文案渲染期翻译（模块级常量会在语言切换后过期）
const FILTERS = ['all', 'done', 'downloading'] as const
type FilterId = typeof FILTERS[number]
const filterLabel = (id: FilterId) => id === 'done'
	? tr('已完成', 'Completed')
	: id === 'downloading' ? tr('正在下载', 'Downloading') : tr('全部', 'All')
const QUALITIES = [
	{ value: '', label: 'all' },
	{ value: '128k', label: '128k' },
	{ value: '320k', label: '320k' },
	{ value: 'flac', label: 'flac' },
]

interface CacheItem {
	name: string
	uri: string
	size: number
	mtime: number
	title?: string
	artist?: string
	/** 归一化后的音质：128k / 320k / flac / unknown */
	quality?: string
	folder?: string
}

const DownloadsScreen = () => {
	const { isDark, glassAlpha } = useAppTheme()
	const g = glass(!!isDark, Number(glassAlpha ?? 0.55))
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const [filter, setFilter] = useState<string>(FILTERS[0])
	const [items, setItems] = useState<CacheItem[]>([])
	const [total, setTotal] = useState(0)
	const [loading, setLoading] = useState(true)
	// 音质胶囊是「筛选器」，不是默认下载音质（默认音质在设置里）
	// 初始值支持 dev 深链预设（_dev.dlFilter），用于自动化验证筛选是否真的生效
	const [quality, setQuality] = React.useState(() => String(getSetting('_dev.dlFilter', '') ?? ''))
	const tasks = downloadTasksStore.useValue()
	const downloading = Object.values(tasks ?? {}).filter((t: any) => t.status === 'downloading')
	const failed = Object.values(tasks ?? {}).filter((t: any) => t.status === 'failed')

	const cacheDir = `${FS.documentDirectory}musicCache/`
	const limitMb = Number(getSetting('download.cacheLimitMb', 500)) || 500

	const load = useCallback(async() => {
		setLoading(true)
		try {
			const { scanDownloads, getDownloadSize } = await import('@/jk/downloadStore')
			const list = await scanDownloads()
			setItems(list.map(item => ({
				name: item.name,
				uri: item.uri,
				size: item.size,
				mtime: item.mtime,
				title: item.meta?.title,
				artist: item.meta?.artist,
				quality: normalizeQuality(String(item.meta?.quality ?? ''), item.size, item.name),
				folder: item.folder,
			})) as any)
			const { bytes } = await getDownloadSize()
			setTotal(bytes)
			logInfo('[downloads] 刷新', 'count=', list.length, 'total=', (bytes / 1024 / 1024).toFixed(1) + 'MB')
		} catch (err) {
			logError('[downloads] 扫描下载目录失败', String((err as any)?.message ?? err))
			setItems([])
			setTotal(0)
		} finally {
			setLoading(false)
		}
	}, [])

	const runBackfill = useCallback(async() => {
		try {
			const { backfillCacheIndex } = await import('@/jk/cacheBackfill')
			const r = await backfillCacheIndex()
			if (r.filled > 0) await load()
		} catch { /* ignore */ }
	}, [load])

	useEffect(() => { void load() }, [load])

	// 下载任务状态变化时刷新列表：否则手动下载完成后停在下载页看不到新条目
	const lastTaskKeyRef = React.useRef('')
	useEffect(() => {
		const key = Object.entries(tasks ?? {})
			.map(([id, t]: [string, any]) => `${id}:${t?.status ?? ''}:${t?.percent ?? 0}`)
			.join('|')
		if (key === lastTaskKeyRef.current) return
		lastTaskKeyRef.current = key
		const timer = setTimeout(() => { void load() }, 700)
		return () => clearTimeout(timer)
	}, [tasks, load])

	// tab 页的 useEffect 只跑一次，回填必须挂在 focus 上（P110 教训）
	useFocusEffect(React.useCallback(() => {
		void (async() => {
			await load()
			await runBackfill()
		})()
	}, [load, runBackfill]))

	const playLocal = async(item: CacheItem) => {
		try {
			const tp = (await import('@/helpers/trackPlayerIndex')).default as any
			const { readSidecar } = await import('@/jk/downloadStore')
			const side = await readSidecar(item.uri)
			const fallbackName = item.name.replace(/\.[^.]+$/, '')
			const track: any = {
				// 加 local: 前缀：否则与在线同曲 id/platform 相同，play() 会误判「已经在播」
				// 并复用上一次的 nativeQueue（没有 url），最终拿到 fake-audio（duration=0 卡住）
				id: `local:${side.meta?.sourceId || fallbackName}`,
				platform: side.meta?.source || 'local',
				title: side.meta?.title || fallbackName,
				artist: side.meta?.artist || tr('本地下载', 'Downloaded'),
				album: side.meta?.album || '',
				duration: Number(side.meta?.duration ?? 0) || 0,
				// 必须做 percent-encoding：文件名是「歌名 - 歌手」，含中文/空格/括号，
				// 直接拼 file:// 会让 AVPlayer 解析失败（duration=0，表现为卡住播不了）
				url: fileUriFromPath(item.uri.replace(/^file:\/\//, '')),
			}
			logInfo('[downloads] 试听本地文件', track.url)
			await tp.playWithReplacePlayList(track, [track])
		} catch (err) {
			logError('[downloads] 试听失败', String((err as any)?.message ?? err))
		}
	}

	const removeOne = async(uri: string) => {
		try {
			const { removeDownload } = await import('@/jk/downloadStore')
			await removeDownload(uri)
			await load()
		} catch (err) {
			logError('[downloads] 删除失败', String((err as any)?.message ?? err))
		}
	}

	// 手动下载都是已完成项；"正在下载"走上面的任务卡片。
	// 音质胶囊必须真正参与过滤，否则选了 128k 仍然显示全部（P 系列回归）
	const filtered = items.filter(it => {
		if (quality && String(it.quality ?? '') !== quality) return false
		return true
	})
	const shown = filter === 'downloading' ? [] : filtered

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 8 }}>
				<Text style={{ color: c.textStrong, fontSize: macFont.display, fontWeight: '700' }}>{tr('下载', 'Downloads')}</Text>
			</View>

			{/* 筛选胶囊 */}
			<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: macSpace.pageX, gap: 8 }}>
				{FILTERS.map(item => {
					const active = item === filter
					const count = item === 'downloading' ? downloading.length : items.length
					return (
						<Pressable key={item} onPress={() => setFilter(item)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: macRadius.pill, backgroundColor: active ? c.primary : g.fill, borderWidth: 0.5, borderColor: active ? c.primary : g.stroke }}>
							<Text style={{ color: active ? '#fff' : c.text, fontSize: macFont.caption }}>{filterLabel(item)} {count}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			{/* 音质选择 */}
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: macSpace.pageX, marginTop: 10 }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>{tr('筛选音质', 'Filter')}</Text>
				{QUALITIES.map(q => {
					const active = q.value === quality
					return (
						<Pressable
							key={q.value}
							onPress={() => setQuality(q.value)}
							style={{
								paddingHorizontal: 12, paddingVertical: 5, borderRadius: macRadius.pill,
								borderWidth: active ? 1 : 0.5,
								borderColor: active ? c.primary : c.divider,
								// 与筛选胶囊保持一致：选中实心主题色
								backgroundColor: active ? c.primary : 'transparent',
							}}
						>
							<Text style={{ color: active ? '#fff' : c.textMuted, fontSize: macFont.caption, fontWeight: active ? '600' : '400' }}>{q.value === '' ? tr('全部', 'All') : q.label}</Text>
						</Pressable>
					)
				})}
			</View>

			{(downloading.length > 0 || failed.length > 0) ? (
				<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 10, gap: 8 }}>
					{downloading.map((t: any) => (
						<View key={`dl-${t.id}`} style={{ backgroundColor: g.fill, borderWidth: 0.5, borderColor: g.stroke, borderRadius: 10, padding: 12 }}>
							<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
								<Text style={{ color: c.text, fontSize: macFont.body }} numberOfLines={1}>{t.title || t.id}</Text>
								<Text style={{ color: c.primary, fontSize: macFont.caption }}>{t.percent}%</Text>
							</View>
							<View style={{ height: 4, borderRadius: 2, backgroundColor: c.divider, marginTop: 6 }}>
								<View style={{ width: `${Math.min(100, t.percent)}%`, height: 4, borderRadius: 2, backgroundColor: c.primary }} />
							</View>
						</View>
					))}
					{failed.map((t: any) => (
						<View key={`fl-${t.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: g.fill, borderWidth: 0.5, borderColor: g.stroke, borderRadius: 10, padding: 12 }}>
							<View style={{ flex: 1 }}>
								<Text style={{ color: c.text, fontSize: macFont.body }} numberOfLines={1}>{t.title || t.id}</Text>
								<Text style={{ color: c.danger, fontSize: macFont.caption }}>{tr('失败：', 'Failed: ')}{String(t.error ?? '').slice(0, 40)}</Text>
							</View>
							<View style={{ flexDirection: 'row', gap: 8 }}>
								<Pressable onPress={() => { void import('@/jk/downloader').then(m => m.downloadTrack({ id: t.id, title: t.title, artist: '', platform: 'kw', album: '' })) }} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
									<Text style={{ color: c.primary, fontSize: macFont.caption }}>{tr('重试', 'Retry')}</Text>
								</Pressable>
								<Pressable onPress={() => { void import('@/jk/downloadTasksStore').then(m => m.removeTask(t.id)) }} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
									<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>{tr('清除', 'Clear')}</Text>
								</Pressable>
							</View>
						</View>
					))}
				</View>
			) : null}

			{loading ? (
				<StateView mode="loading" />
			) : shown.length === 0 ? (
				<StateView mode="empty" title={tr('暂无已下载歌曲', 'No downloaded songs')} hint={tr('在歌曲行右侧「⋯」菜单里选「下载」', 'Pick Download from the "⋯" menu on a song row')} />
			) : (
				<FlatList
					data={shown}
					keyExtractor={item => item.name}
					style={{ flex: 1, marginTop: 8 }}
					contentContainerStyle={{ paddingBottom: 176 }}
					renderItem={({ item }) => (
						<View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: macSpace.pageX / 2, borderBottomWidth: 0, borderBottomColor: c.divider }}>
							<View style={{ flex: 1 }}>
								<Text numberOfLines={1} style={{ color: c.text, fontSize: macFont.body }}>
									{item.title || item.name.replace(/\.(mp3|flac|m4a)$/i, '')}
								</Text>
								{item.artist ? (
									<Text numberOfLines={1} style={{ color: c.textMuted, fontSize: macFont.badge, marginTop: 1 }}>
										{item.artist}
									</Text>
								) : null}
								<Text style={{ color: c.textMuted, fontSize: macFont.badge, marginTop: 2 }}>
									{(item.size / 1024 / 1024).toFixed(1)}MB · {(item as any).quality ?? 'unknown'} · {new Date(item.mtime).toLocaleDateString()}
								</Text>
							</View>
							<Pressable onPress={() => playLocal(item)} hitSlop={8} style={{ paddingHorizontal: 8 }}>
								<Text style={{ color: c.primary, fontSize: macFont.caption }}>{tr('试听', 'Preview')}</Text>
							</Pressable>
							<Pressable onPress={() => removeOne(item.uri)} hitSlop={8} style={{ paddingHorizontal: 8 }}>
								<Text style={{ color: c.danger, fontSize: macFont.caption }}>{tr('删除', 'Delete')}</Text>
							</Pressable>
						</View>
					)}
				/>
			)}

		</View>
	)
}

export default DownloadsScreen
