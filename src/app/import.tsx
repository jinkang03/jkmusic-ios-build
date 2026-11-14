/**
 * 深链导入音源：jkmusic://import?url=<脚本地址>
 *
 * 存在的意义有两个：
 * 1) 产品：设置页已有「从 URL 导入」，这里提供等价的深链入口，方便自动化/脚本化导入。
 * 2) 验收：模拟器无法用 simctl 点击文件选择器，深链是本机端到端验证的唯一无人工通道。
 *
 * 只做三件事：取脚本文本 → 注册 → 选中。失败会把错误原文显示在页面上，便于截图取证。
 *
 * 安全：这个入口等价于「给一个 URL 就下载并执行任意 lx 脚本」（远程代码执行面），
 * **正式包必须关闭**：只有 EXPO_PUBLIC_JK_DEV_IMPORT === '1' 或 __DEV__ 时才启用。
 */
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { musicApiSelectedStore, musicApiStore } from '@/player/PlayerStore'
import { logInfo } from '@/helpers/logger'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useAppTheme } from '@/hooks/useAppTheme'

const DEV_IMPORT_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_JK_DEV_IMPORT === '1'

const ImportSourceScreen = () => {
	const { colors } = useAppTheme()
	const router = useRouter()
	const params = useLocalSearchParams<{ url?: string, name?: string }>()
	const startedRef = useRef(false)
	const [status, setStatus] = useState<'fetching' | 'registering' | 'ok' | 'failed'>('fetching')
	const [detail, setDetail] = useState('准备中…')

	useEffect(() => {
		if (startedRef.current) return
		startedRef.current = true
		const url = String(params.url ?? '')
		if (!url) {
			setStatus('failed')
			setDetail('缺少 url 参数')
			return
		}
		void (async() => {
			try {
				setStatus('fetching')
				setDetail(`下载 ${url.slice(0, 80)}…`)
				const res = await fetch(url)
				const script = await res.text()
				if (!res.ok || !script.length) throw new Error(`下载失败 status=${res.status} len=${script.length}`)

				setStatus('registering')
				setDetail(`脚本 ${(script.length / 1024).toFixed(1)} KB，正在注册…`)
				const api = {
					id: `imported_${Date.now()}`,
					name: params.name ?? url.split('/').pop() ?? 'imported',
					description: 'deep-link import',
					version: '1.0.0',
					author: 'deep-link',
					homepage: '',
					srcUrl: url,
					scriptType: 'lxmusic' as const,
					script,
				} as unknown as IMusic.MusicApi
				const reloaded = await myTrackPlayer.reloadMusicApi(api, true)
				// 必须把「reload 之后的 api」入库：reload 才带上 supportedSources 与 getMusicUrl，
				// 而 setMusicApiAsSelectedById 是按 id 从 musicApiStore 里取对象再挂载的。
				const existing = (musicApiStore.getValue() ?? []).filter((it: any) => it.id !== reloaded.id)
				musicApiStore.setValue([...existing, reloaded])
				await myTrackPlayer.setMusicApiAsSelectedById(reloaded.id)
				const selected = musicApiSelectedStore.getValue()
				if (!selected || selected.id !== reloaded.id) {
					throw new Error('音源未进入选中态（musicApiSelectedStore 为空）')
				}
				const sources = (((reloaded as any).supportedSources ?? []) as string[]).join(',')
				logInfo('[jk/import] ok', reloaded.name, sources || '(no sources reported)')
				setStatus('ok')
				setDetail(`已导入并选中：${reloaded.name}\n可用源：${sources || '(未上报)'}`)
			} catch (err: any) {
				logInfo('[jk/import] failed', err?.message ?? err)
				setStatus('failed')
				setDetail(`导入失败：${err?.message ?? err}`)
			}
		})()
	}, [params.url, params.name])

	if (!DEV_IMPORT_ENABLED) {
		return (
			<View style={{ flex: 1, backgroundColor: colors.background, padding: 20, justifyContent: 'center' }}>
				<Text style={{ color: colors.textMuted, textAlign: 'center' }}>
					该入口仅在开发构建可用（正式包已关闭远程脚本导入）
				</Text>
			</View>
		)
	}

	return (
		<View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
			<Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 40 }}>
				导入音源
			</Text>
			<View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
				{status === 'fetching' || status === 'registering' ? (
					<ActivityIndicator color={colors.loading} />
				) : null}
				<Text style={{ color: status === 'failed' ? '#ff6b6b' : colors.textMuted, fontSize: 13, flex: 1 }}>
					{status} · {detail}
				</Text>
			</View>
			<ScrollView style={{ marginTop: 24 }}>
				<Text style={{ color: colors.textMuted, fontSize: 12 }}>
					{status === 'ok'
						? '音源已就绪，可以直接用它播放了。'
						: '如果失败，确认脚本地址可访问（本机 http://127.0.0.1:8787/…）。'}
				</Text>
			</ScrollView>
			<Pressable
				onPress={() => router.replace('/(tabs)/songs' as any)}
				style={{ marginTop: 20, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface }}
			>
				<Text style={{ color: colors.text }}>回到音乐</Text>
			</Pressable>
		</View>
	)
}

export default ImportSourceScreen
