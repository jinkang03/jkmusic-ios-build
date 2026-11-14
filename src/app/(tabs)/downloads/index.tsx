/**
 * 下载页：把缓存目录变成用户可见的资产。
 * 数据源就是 Documents/musicCache 里的真实文件（先下载后播放策略的副产物）。
 */
import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as FS from 'expo-file-system/legacy'
import StateView from '@/components/mac/StateView'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { getSetting, setSetting, useSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'

const FILTERS = ['全部', '已完成', '正在下载'] as const
const QUALITIES = [
	{ value: '128k', label: '128k' },
	{ value: '320k', label: '320k' },
	{ value: 'flac', label: 'flac' },
]

interface CacheItem {
	name: string
	uri: string
	size: number
	mtime: number
}

const DownloadsScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const [filter, setFilter] = useState<string>(FILTERS[0])
	const [items, setItems] = useState<CacheItem[]>([])
	const [total, setTotal] = useState(0)
	const [loading, setLoading] = useState(true)
	const [quality, setQuality] = useSetting('player.playQuality', '320k')

	const cacheDir = `${FS.documentDirectory}musicCache/`
	const limitMb = Number(getSetting('download.cacheLimitMb', 500)) || 500

	const load = useCallback(async() => {
		setLoading(true)
		try {
			const names: string[] = await FS.readDirectoryAsync(cacheDir).catch(() => [])
			const list: CacheItem[] = []
			let sum = 0
			for (const name of names) {
				const uri = `${cacheDir}${name}`
				try {
					const st: any = await FS.getInfoAsync(uri)
					if (!st?.exists || st.isDirectory) continue
					const size = Number(st.size ?? 0)
					sum += size
					list.push({ name, uri, size, mtime: Number(st.modificationTime ?? 0) })
				} catch { /* 单个文件失败忽略 */ }
			}
			list.sort((a, b) => b.mtime - a.mtime)
			setItems(list)
			setTotal(sum)
			logInfo('[downloads] 刷新', `files=${list.length}`, `total=${(sum / 1024 / 1024).toFixed(1)}MB`)
		} catch (err) {
			logError('[downloads] 读取缓存目录失败', String((err as any)?.message ?? err))
			setItems([])
			setTotal(0)
		} finally {
			setLoading(false)
		}
	}, [cacheDir])

	useEffect(() => { void load() }, [load])

	const removeOne = async(uri: string) => {
		try {
			await FS.deleteAsync(uri, { idempotent: true })
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

	const shown = filter === '正在下载' ? [] : items
	const mb = (total / 1024 / 1024).toFixed(1)

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 8 }}>
				<Text style={{ color: c.textStrong, fontSize: macFont.display, fontWeight: '700' }}>下载</Text>
			</View>

			{/* 筛选胶囊 */}
			<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: macSpace.pageX, gap: 8 }}>
				{FILTERS.map(item => {
					const active = item === filter
					const count = item === '正在下载' ? 0 : items.length
					return (
						<Pressable key={item} onPress={() => setFilter(item)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: macRadius.pill, backgroundColor: active ? c.primary : c.fillSubtle }}>
							<Text style={{ color: active ? '#fff' : c.text, fontSize: macFont.caption }}>{item} {count}</Text>
						</Pressable>
					)
				})}
			</ScrollView>

			{/* 音质选择 */}
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: macSpace.pageX, marginTop: 10 }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>下载音质</Text>
				{QUALITIES.map(q => {
					const active = q.value === quality
					return (
						<Pressable key={q.value} onPress={() => setQuality(q.value)} style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: macRadius.pill, borderWidth: active ? 1 : 0.5, borderColor: active ? c.primary : c.divider }}>
							<Text style={{ color: active ? c.primary : c.textMuted, fontSize: macFont.caption }}>{q.label}</Text>
						</Pressable>
					)
				})}
			</View>

			{loading ? (
				<StateView mode="loading" />
			) : shown.length === 0 ? (
				<StateView mode="empty" title="暂无已下载歌曲" hint="播放过的歌曲会自动缓存到这里" />
			) : (
				<FlatList
					data={shown}
					keyExtractor={item => item.name}
					style={{ flex: 1, marginTop: 8 }}
					renderItem={({ item }) => (
						<View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: macSpace.pageX / 2, borderBottomWidth: 0.5, borderBottomColor: c.divider }}>
							<View style={{ flex: 1 }}>
								<Text numberOfLines={1} style={{ color: c.text, fontSize: macFont.body }}>
									{item.name.replace(/\.(mp3|flac|m4a)$/i, '')}
								</Text>
								<Text style={{ color: c.textMuted, fontSize: macFont.badge, marginTop: 2 }}>
									{(item.size / 1024 / 1024).toFixed(1)}MB · {quality} · {new Date(item.mtime).toLocaleDateString()}
								</Text>
							</View>
							<Pressable onPress={() => removeOne(item.uri)} hitSlop={8} style={{ paddingHorizontal: 8 }}>
								<Text style={{ color: c.danger, fontSize: macFont.caption }}>删除</Text>
							</Pressable>
						</View>
					)}
				/>
			)}

			{/* 底部信息条 */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: macSpace.pageX, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: c.divider }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>已用 {mb} MB / 上限 {limitMb} MB</Text>
				<Pressable onPress={clearAll} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
					<Text style={{ color: c.text, fontSize: macFont.caption }}>清理全部</Text>
				</Pressable>
			</View>
		</View>
	)
}

export default DownloadsScreen
