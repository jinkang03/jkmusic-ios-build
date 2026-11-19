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
import { useAppTheme } from '@/hooks/useAppTheme'
import { getSetting, setSetting, useSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'
import { readCacheIndex, removeCacheIndexEntry } from '@/player/CacheManager'
import { normalizeQuality } from '@/jk/downloader'
import { downloadTasksStore } from '@/jk/downloadTasksStore'
import { tr } from '@/utils/i18n'

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
}

const DownloadsScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const [filter, setFilter] = useState<string>(FILTERS[0])
	const [items, setItems] = useState<CacheItem[]>([])
	const [total, setTotal] = useState(0)
	const [loading, setLoading] = useState(true)
	// 音质胶囊是「筛选器」，不是默认下载音质（默认音质在设置里）
	const [quality, setQuality] = React.useState('')
	const tasks = downloadTasksStore.useValue()
	const downloading = Object.values(tasks ?? {}).filter((t: any) => t.status === 'downloading')
	const failed = Object.values(tasks ?? {}).filter((t: any) => t.status === 'failed')

	const cacheDir = `${FS.documentDirectory}musicCache/`
	const limitMb = Number(getSetting('download.cacheLimitMb', 500)) || 500

	const load = useCallback(async() => {
		setLoading(true)
		try {
			const names: string[] = (await FS.readDirectoryAsync(cacheDir).catch(() => []))
				.filter((n: string) => n !== 'index.json' && !n.endsWith('.part'))
			const index = await readCacheIndex()
			const list: CacheItem[] = []
			let legacyCount = 0
			let sum = 0
			for (const name of names) {
				const uri = `${cacheDir}${name}`
				try {
					const st: any = await FS.getInfoAsync(uri)
					if (!st?.exists || st.isDirectory) continue
					const size = Number(st.size ?? 0)
					sum += size
					const mt = Number(st.modificationTime ?? 0)
					// RN 返回秒级时间戳，new Date() 需要毫秒
					const meta: any = index[name] ?? {}
					// 只显示「用户手动下载」的条目；播放产生的缓存不进下载页
					if (meta.manual !== true) {
						if (meta.manual === undefined) legacyCount++
						continue
					}
					list.push({
						name, uri, size,
						mtime: mt > 1e12 ? mt : mt * 1000,
						title: meta.title,
						artist: meta.artist,
						quality: normalizeQuality(String(meta.quality ?? ''), size),
					} as any)
				} catch { /* 单个文件失败忽略 */ }
			}
			if (legacyCount > 0) logInfo('[cache] 迁移老条目（视为缓存）count=', legacyCount)
			list.sort((a, b) => b.mtime - a.mtime)
			setItems(list)
			setTotal(sum)
			const manualN = list.length
			const autoN = Object.values(index).filter((x: any) => x?.manual !== true).length
			logInfo('[downloads] 刷新', `manual=${manualN}`, `auto=${autoN}`, `total=${(sum / 1024 / 1024).toFixed(1)}MB`)
		} catch (err) {
			logError('[downloads] 读取缓存目录失败', String((err as any)?.message ?? err))
			setItems([])
			setTotal(0)
		} finally {
			setLoading(false)
		}
	}, [cacheDir])

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
			const track: any = {
				id: item.name.replace(/\.[^.]+$/, ''),
				platform: 'local',
				title: item.name.replace(/\.[^.]+$/, ''),
				artist: tr('本地缓存', 'Local cache'),
				duration: 0,
				url: item.uri.startsWith('file://') ? item.uri : `file://${item.uri}`,
			}
			logInfo('[downloads] 试听本地文件', track.url)
			await tp.playWithReplacePlayList(track, [track])
		} catch (err) {
			logError('[downloads] 试听失败', String((err as any)?.message ?? err))
		}
	}

	const removeOne = async(uri: string) => {
		try {
			await FS.deleteAsync(uri, { idempotent: true })
			await removeCacheIndexEntry(uri.split('/').pop() ?? '')
			await load()
		} catch (err) {
			logError('[downloads] 删除失败', String((err as any)?.message ?? err))
		}
	}

	const clearAll = async() => {
		try {
			await FS.deleteAsync(cacheDir, { idempotent: true })
			await load()
		} catch (err) {
			logError('[downloads] 清理失败', String((err as any)?.message ?? err))
		}
	}

	const filtered = quality ? items.filter((i: any) => String(i.quality) === quality) : items
	const shown = filter === 'downloading' ? [] : filtered
	const mb = (total / 1024 / 1024).toFixed(1)

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
						<Pressable key={item} onPress={() => setFilter(item)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: macRadius.pill, backgroundColor: active ? c.primary : c.fillSubtle }}>
							<Text style={{ color: active ? '#fff' : c.text, fontSize: macFont.caption }}>{filterLabel(item)} {count}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			{/* 音质选择 */}
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: macSpace.pageX, marginTop: 10 }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>{tr('下载音质', 'Quality')}</Text>
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
						<View key={`dl-${t.id}`} style={{ backgroundColor: c.fillSubtle, borderRadius: 10, padding: 12 }}>
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
						<View key={`fl-${t.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.fillSubtle, borderRadius: 10, padding: 12 }}>
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
					renderItem={({ item }) => (
						<View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: macSpace.pageX / 2, borderBottomWidth: 0.5, borderBottomColor: c.divider }}>
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

			{/* 底部信息条 */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: macSpace.pageX, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: c.divider }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>{tr('已用', 'Used')} {mb} MB / {tr('上限', 'Limit')} {limitMb} MB</Text>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<Pressable onPress={() => { void runBackfill() }} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
						<Text style={{ color: c.text, fontSize: macFont.caption }}>{tr('刷新信息', 'Refresh')}</Text>
					</Pressable>
					<Pressable onPress={clearAll} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
						<Text style={{ color: c.text, fontSize: macFont.caption }}>{tr('清理全部', 'Clear all')}</Text>
					</Pressable>
				</View>
			</View>
		</View>
	)
}

export default DownloadsScreen
