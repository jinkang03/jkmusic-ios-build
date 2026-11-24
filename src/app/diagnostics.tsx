/**
 * 播放诊断：最近 50 次「失败 / 换源 / 停住 / 崩溃」。
 * 用于解释「为什么换源」，不用翻日志。
 */
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { clearDiagnostics, playbackDiagnosticsStore, type PlaybackDiagEntry } from '@/jk/playbackDiagnostics'
import { tr } from '@/utils/i18n'

const KIND_LABEL: Record<string, { zh: string, en: string }> = {
	switch: { zh: '换源', en: 'Switched' },
	halt: { zh: '停住', en: 'Halted' },
	fail: { zh: '失败', en: 'Failed' },
	crash: { zh: '崩溃', en: 'Crash' },
}

const formatTime = (at: number) => {
	const d = new Date(at)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const DiagnosticsScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const router = useRouter()
	const entries = playbackDiagnosticsStore.useValue() as PlaybackDiagEntry[]

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{
				flexDirection: 'row', alignItems: 'center', gap: 12,
				paddingHorizontal: macSpace.pageX, paddingVertical: 10,
			}}>
				<Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/settings' as any))} hitSlop={8}>
					<Text style={{ color: c.primary, fontSize: macFont.body }}>‹ {tr('返回', 'Back')}</Text>
				</Pressable>
				<Text style={{ color: c.textStrong, fontSize: macFont.pageTitle, fontWeight: '600', flex: 1 }}>
					{tr('播放诊断', 'Playback Diagnostics')}
				</Text>
				{entries.length ? (
					<Pressable onPress={clearDiagnostics} hitSlop={8}>
						<Text style={{ color: c.danger, fontSize: macFont.caption }}>{tr('清空', 'Clear')}</Text>
					</Pressable>
				) : null}
			</View>

			<ScrollView contentContainerStyle={{ paddingHorizontal: macSpace.pageX, paddingBottom: insets.bottom + 24 }}>
				{entries.length === 0 ? (
					<Text style={{ color: c.textMuted, fontSize: macFont.body, paddingVertical: 24 }}>
						{tr('还没有记录。播放失败或换源后会出现在这里。', 'No records yet. Failures and source switches will show up here.')}
					</Text>
				) : entries.map((item, index) => {
					const kind = KIND_LABEL[item.kind] ?? KIND_LABEL.fail
					const isSwitch = item.kind === 'switch'
					return (
						<View
							key={`${item.at}-${index}`}
							style={{
								paddingVertical: 10,
								borderBottomWidth: 1,
								borderBottomColor: c.divider,
							}}
						>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
								<View style={{
									paddingHorizontal: 8, paddingVertical: 2, borderRadius: macRadius.thumb,
									backgroundColor: isSwitch ? `${c.primary}22` : `${c.danger}22`,
								}}>
									<Text style={{ color: isSwitch ? c.primary : c.danger, fontSize: macFont.badge }}>
										{tr(kind.zh, kind.en)}
									</Text>
								</View>
								<Text style={{ color: c.text, fontSize: macFont.body, flex: 1 }} numberOfLines={1}>
									{item.title || '—'}
								</Text>
								<Text style={{ color: c.textMuted, fontSize: macFont.badge }}>{formatTime(item.at)}</Text>
							</View>
							<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: 4 }}>
								{isSwitch
									? `${item.from || '?'} → ${item.to || '?'}  ·  ${item.reason}`
									: `${item.from || '?'}  ·  ${item.reason}`}
							</Text>
							{item.detail ? (
								<Text style={{ color: c.textMuted, fontSize: macFont.badge, marginTop: 2 }} numberOfLines={2}>
									{item.detail}
								</Text>
							) : null}
						</View>
					)
				})}
			</ScrollView>
		</View>
	)
}

export default DiagnosticsScreen
