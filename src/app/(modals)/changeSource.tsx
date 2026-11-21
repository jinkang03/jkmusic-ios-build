/**
 * 歌曲换源（对齐 mac 的「歌曲换源」弹窗）。
 *
 * 交互：顶部 5 个平台 tab → 自动用「歌名 歌手」搜索该平台 →
 * 列表里选一条（可试听）→ 底部显示「原 → 新」→ 确认后替换歌单里这一首。
 *
 * 入参走模块级变量（pendingChangeSource），URL 参数会丢 meta。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { tr } from '@/utils/i18n'
import { showToast } from '@/utils/utils'
import { takePendingChangeSource } from '@/jk/pendingChangeSource'
import { replaceSong } from '@/jk/libraryStore'
import { sourceLabel } from '@/jk/sourceLabels'
import { logError, logInfo } from '@/helpers/logger'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import type { JKMusic } from '@/jk/musicSdk'

const PLATFORMS: Array<{ id: string, short: string }> = [
	{ id: 'kw', short: '酷我音乐' },
	{ id: 'kg', short: '酷狗音乐' },
	{ id: 'tx', short: '企鹅音乐' },
	{ id: 'wy', short: '网易音乐' },
	{ id: 'mg', short: '咪咕音乐' },
]

const formatInterval = (v: any) => {
	const text = String(v ?? '')
	if (/^\d+:\d{2}/.test(text)) return text.slice(0, 5)
	const s = Number(v ?? 0)
	if (!Number.isFinite(s) || s <= 0) return '--:--'
	return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

const ChangeSourceScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const router = useRouter()

	const original = useMemo(() => takePendingChangeSource(), [])
	const [platform, setPlatform] = useState<string>(() => {
		const src = String(original?.source ?? 'tx')
		return PLATFORMS.some(p => p.id === src) ? src : 'tx'
	})
	const [query, setQuery] = useState(() => `${String(original?.name ?? '')} ${String(original?.singer ?? '')}`.trim())
	const [results, setResults] = useState<JKMusic[]>([])
	const [loading, setLoading] = useState(false)
	const [selected, setSelected] = useState<JKMusic | null>(null)
	const requestRef = useRef(0)

	const runSearch = useCallback(async(nextPlatform: string, nextQuery: string) => {
		const q = String(nextQuery ?? '').trim()
		if (!q) return
		const requestId = ++requestRef.current
		setLoading(true)
		try {
			const { searchBySource } = await import('@/jk/musicSdk')
			const list = await searchBySource(nextPlatform as any, q, 1)
			if (requestId !== requestRef.current) return
			setResults((list ?? []) as JKMusic[])
			logInfo('[changeSource] search', nextPlatform, 'q=', q, 'count=', (list ?? []).length)
		} catch (err) {
			if (requestId === requestRef.current) {
				setResults([])
				logError('[changeSource] search failed', String((err as any)?.message ?? err))
			}
		} finally {
			if (requestId === requestRef.current) setLoading(false)
		}
	}, [])

	// 进入即按当前平台搜一次
	useEffect(() => {
		if (!original) return
		void runSearch(platform, query)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const switchPlatform = (id: string) => {
		if (id === platform) return
		setPlatform(id)
		setSelected(null)
		void runSearch(id, query)
	}

	const preview = async(item: JKMusic) => {
		try {
			const { jkToTrack } = await import('@/jk/adapt')
			const track: any = jkToTrack(item)
			showToast(tr('试听', 'Preview'), tr('试听会切换当前播放', 'Preview switches playback'), 'info')
			await myTrackPlayer.playWithReplacePlayList(track, [track])
		} catch (err) {
			logError('[changeSource] preview failed', String((err as any)?.message ?? err))
		}
	}

	const confirm = async() => {
		if (!original || !selected) return
		try {
			const count = replaceSong(original, selected)
			logInfo('[changeSource] replaced', original.name, original.source, '->', selected.source, 'count=', count)
			const current: any = myTrackPlayer.getCurrentMusic?.() ?? null
			const isPlayingThis = current &&
				String(current.id) === String(original.id) &&
				String(current.platform) === String(original.source)
			if (isPlayingThis) {
				const { jkToTrack } = await import('@/jk/adapt')
				await myTrackPlayer.play(jkToTrack(selected) as any)
			}
			showToast(
				tr('已换源', 'Source changed'),
				`${String(original.name ?? '')} → ${sourceLabel(String(selected.source), true)}`,
				'success',
			)
			router.back()
		} catch (err) {
			logError('[changeSource] replace failed', String((err as any)?.message ?? err))
			showToast(tr('换源失败', 'Failed'), String((err as any)?.message ?? err).slice(0, 60), 'error')
		}
	}

	if (!original) {
		return (
			<View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
				<Text style={{ color: c.text }}>{tr('没有待换源的歌曲', 'No song to change')}</Text>
			</View>
		)
	}

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
			{/* 标题栏 */}
			<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: macSpace.pageX, paddingBottom: 10 }}>
				<Text style={{ flex: 1, color: c.textStrong, fontSize: macFont.display, fontWeight: '700' }}>
					{tr('歌曲换源', 'Change Source')}
				</Text>
				<Pressable onPress={() => router.back()} hitSlop={12}>
					<Ionicons name="close" size={24} color={c.text} />
				</Pressable>
			</View>

			{/* 原曲目 */}
			<View style={{ marginHorizontal: macSpace.pageX, padding: 12, borderRadius: macRadius.card, backgroundColor: c.fillSubtle }}>
				<Text numberOfLines={1} style={{ color: c.text, fontSize: macFont.body }}>
					{String(original.name ?? '')}
				</Text>
				<Text numberOfLines={1} style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: 2 }}>
					{String(original.singer ?? '')} · {sourceLabel(String(original.source ?? ''), true)} · {formatInterval(original.interval)}
				</Text>
			</View>

			{/* 搜索框 */}
			<View style={{
				flexDirection: 'row', alignItems: 'center', gap: 8,
				marginHorizontal: macSpace.pageX, marginTop: 12,
				height: 40, borderRadius: macRadius.pill, backgroundColor: c.fillSubtle, paddingHorizontal: 12,
			}}>
				<Ionicons name="search" size={16} color={c.textMuted} />
				<TextInput
					value={query}
					onChangeText={setQuery}
					onSubmitEditing={() => runSearch(platform, query)}
					returnKeyType="search"
					placeholder={tr('搜索歌名或歌手', 'Search title or artist')}
					placeholderTextColor={c.textMuted}
					style={{ flex: 1, color: c.text, fontSize: macFont.body, padding: 0 }}
				/>
				<Pressable onPress={() => runSearch(platform, query)} hitSlop={8}>
					<Text style={{ color: c.primary, fontSize: macFont.body }}>{tr('搜索', 'Search')}</Text>
				</Pressable>
			</View>

			{/* 平台 tab */}
			<View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: macSpace.pageX, marginTop: 12 }}>
				{PLATFORMS.map(p => {
					const active = p.id === platform
					return (
						<Pressable
							key={p.id}
							onPress={() => switchPlatform(p.id)}
							style={{
								flex: 1, height: 32, borderRadius: macRadius.pill, alignItems: 'center', justifyContent: 'center',
								backgroundColor: active ? c.primary : c.fillSubtle,
							}}
						>
							<Text numberOfLines={1} style={{ color: active ? '#fff' : c.text, fontSize: macFont.badge, fontWeight: active ? '600' : '400' }}>
								{tr(p.short, sourceLabel(p.id, false))}
							</Text>
						</Pressable>
					)
				})}
			</View>

			{/* 结果列表 */}
			{loading ? (
				<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : (
				<FlatList
					data={results}
					keyExtractor={(item, index) => `${item?.source ?? ''}-${item?.id ?? index}`}
					style={{ flex: 1, marginTop: 8 }}
					contentContainerStyle={{ paddingBottom: 16 }}
					ListEmptyComponent={
						<View style={{ padding: 32, alignItems: 'center' }}>
							<Text style={{ color: c.textMuted, fontSize: macFont.body }}>{tr('没有搜索结果', 'No results')}</Text>
						</View>
					}
					renderItem={({ item }) => {
						const active = selected && String(selected.id) === String(item.id) && String(selected.source) === String(item.source)
						return (
							<Pressable
								onPress={() => setSelected(item)}
								style={{
									flexDirection: 'row', alignItems: 'center',
									paddingHorizontal: macSpace.pageX, paddingVertical: 10,
									borderBottomWidth: 0,
									backgroundColor: active ? `${c.primary}14` : 'transparent',
								}}
							>
								<View style={{ flex: 1, minWidth: 0 }}>
									<Text numberOfLines={1} style={{ color: active ? c.primary : c.text, fontSize: macFont.body }}>
										{String(item?.name ?? '')}
									</Text>
									<Text numberOfLines={1} style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: 2 }}>
										{String(item?.singer ?? '')}
										{item?.meta?.albumName ? ` · ${String(item.meta.albumName)}` : ''}
									</Text>
								</View>
								<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginHorizontal: 10 }}>
									{formatInterval(item?.interval)}
								</Text>
								<Pressable onPress={() => preview(item)} hitSlop={8} style={{ padding: 6 }}>
									<Ionicons name="play-circle-outline" size={22} color={c.primary} />
								</Pressable>
								<Pressable onPress={() => setSelected(item)} hitSlop={8} style={{ padding: 6 }}>
									<Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={active ? c.primary : c.textMuted} />
								</Pressable>
							</Pressable>
						)
					}}
				/>
			)}

			{/* 底部对比 + 确认（正常布局，避免盖住最后几行） */}
			<View style={{
				paddingBottom: Math.max(insets.bottom, 12), paddingTop: 10,
				paddingHorizontal: macSpace.pageX,
				backgroundColor: c.bg, borderTopWidth: 0.5, borderTopColor: c.divider,
			}}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
					<Text numberOfLines={1} style={{ flex: 1, color: c.textMuted, fontSize: macFont.caption }}>
						{`${String(original.name ?? '')} ${sourceLabel(String(original.source ?? ''), true)} ${formatInterval(original.interval)}`}
					</Text>
					<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>→</Text>
					<Text numberOfLines={1} style={{ flex: 1, color: selected ? c.primary : c.textMuted, fontSize: macFont.caption }}>
						{selected
							? `${String(selected.name ?? '')} ${sourceLabel(String(selected.source ?? ''), true)} ${formatInterval(selected.interval)}`
							: tr('请选择要替换的歌曲', 'Pick a replacement')}
					</Text>
				</View>
				<Pressable
					onPress={() => { void confirm() }}
					disabled={!selected}
					style={{
						marginTop: 10, height: 44, borderRadius: macRadius.card,
						alignItems: 'center', justifyContent: 'center',
						backgroundColor: selected ? c.primary : c.fillMuted,
					}}
				>
					<Text style={{ color: selected ? '#fff' : c.textMuted, fontSize: macFont.body, fontWeight: '600' }}>
						{tr('确认', 'Confirm')}
					</Text>
				</Pressable>
			</View>
		</View>
	)
}

export default ChangeSourceScreen
