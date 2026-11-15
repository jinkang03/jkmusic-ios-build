/**
 * 音源管理（正式包入口，不受 EXPO_PUBLIC_JK_DEV_IMPORT / __DEV__ 控制）。
 * 深链：jkmusic://sourceManage
 *       jkmusic://sourceManage?url=<脚本地址>&t=<变化值>
 * 导入只走 createMusicApiFromScript / fetchScriptFromUrl，
 * 选中走 setMusicApiAsSelectedById（内部 bindMusicApi）。
 */
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { logError, logInfo } from '@/helpers/logger'
import myTrackPlayer, { musicApiSelectedStore, musicApiStore } from '@/helpers/trackPlayerIndex'
import { createMusicApiFromScript, fetchScriptFromUrl } from '@/helpers/userApi/importMusicSource'
import { bindMusicApi } from '@/jk/sourceRegistry'
import { useAppTheme } from '@/hooks/useAppTheme'
import PersistStatus from '@/store/PersistStatus'
import { showToast } from '@/utils/utils'
import { File } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'
import * as DocumentPicker from 'expo-document-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TITLE = '音源管理'
const PLATFORM_ORDER = ['kw', 'kg', 'tx', 'wy', 'mg']

const formatPlatforms = (sources?: string[]) => {
	const set = new Set((sources ?? []).map(item => String(item)))
	const ordered = PLATFORM_ORDER.filter(item => set.has(item))
	const extra = [...set].filter(item => !PLATFORM_ORDER.includes(item))
	return [...ordered, ...extra].join('/')
}

const toStored = (api: IMusic.MusicApi) => ({
	id: api.id,
	platform: api.platform,
	author: api.author,
	name: api.name,
	version: api.version,
	srcUrl: api.srcUrl,
	script: api.script,
	scriptType: api.scriptType,
	isSelected: !!api.isSelected,
	supportedSources: (api as any).supportedSources ?? [],
})

let evidenceChain: Promise<void> = Promise.resolve()

const appendEvidence = (line: string) => {
	logInfo('[jk/sourceManage]', line)
	evidenceChain = evidenceChain.then(async() => {
		const path = `${FileSystem.documentDirectory}source-manage.log`
		let prev = ''
		try {
			prev = await FileSystem.readAsStringAsync(path)
		} catch {
			prev = ''
		}
		await FileSystem.writeAsStringAsync(path, `${prev}[${new Date().toISOString()}] ${line}\n`)
	}).catch(err => {
		logError('[jk/sourceManage] 写证据日志失败', String((err as any)?.message ?? err))
	})
}

const SourceManageScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const router = useRouter()
	const params = useLocalSearchParams<{ url?: string | string[], t?: string | string[] }>()
	const apis = musicApiStore.useValue() || []
	const selected = musicApiSelectedStore.useValue()
	const selectedId = selected?.id ?? ''
	const selectedName = selected?.name ?? ''
	const selectedSources = formatPlatforms((selected as any)?.supportedSources)
	const [urlText, setUrlText] = useState('')
	const [pasteText, setPasteText] = useState('')
	const [busy, setBusy] = useState(false)
	const [banner, setBanner] = useState('')
	const [bannerOk, setBannerOk] = useState(false)
	const [testNote, setTestNote] = useState<Record<string, string>>({})
	const [pendingDelete, setPendingDelete] = useState<string | null>(null)
	const importedToken = useRef('')

	const urlParam = Array.isArray(params.url) ? params.url[0] ?? '' : params.url ?? ''
	const tParam = Array.isArray(params.t) ? params.t[0] ?? '' : params.t ?? ''

	const persistList = (list: IMusic.MusicApi[]) => {
		musicApiStore.setValue(list)
		PersistStatus.set('music.musicApi', list.map(toStored) as unknown as IMusic.MusicApi[])
	}

	const commitScript = useCallback(async(script: string, srcUrl?: string) => {
		setBusy(true)
		setBanner('正在导入…')
		setBannerOk(false)
		try {
			const musicApi = await createMusicApiFromScript(script)
			if (srcUrl && !musicApi.srcUrl) musicApi.srcUrl = srcUrl
			const current = musicApiStore.getValue() || []
			const next = [...current.filter(item => item.id !== musicApi.id), musicApi]
			persistList(next)
			await myTrackPlayer.setMusicApiAsSelectedById(musicApi.id)
			const selectedNow = musicApiSelectedStore.getValue()
			if (!selectedNow || selectedNow.id !== musicApi.id) {
				throw new Error('音源未进入选中态')
			}
			const sources = formatPlatforms(
				(musicApi as any).supportedSources ?? (selectedNow as any).supportedSources,
			)
			const line = `IMPORT_OK name=${musicApi.name} version=${musicApi.version} sources=${sources || '(none)'}`
			setBanner(`导入成功：${musicApi.name}`)
			setBannerOk(true)
			showToast('导入成功', `${musicApi.name} ${sources}`, 'success')
			appendEvidence(line)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setBanner(`导入失败：${msg}`)
			setBannerOk(false)
			showToast('导入失败', msg.slice(0, 80), 'error')
			appendEvidence(`IMPORT_FAIL ${msg}`)
		} finally {
			setBusy(false)
		}
	}, [])

	// 兜底恢复：musicApiSelectedStore 会从持久化恢复，但 musicApiStore（列表）不会。
	// 幂等：已有非空列表时不动，避免覆盖运行时状态。
	useEffect(() => {
		const current = musicApiStore.getValue() as any[] | undefined
		const persisted = (PersistStatus.get('music.musicApi') as any[] | undefined) ?? []
		logInfo('[source] mount list=', current?.length ?? 0, 'persist=', persisted.length)
		if (current && current.length) {
			logInfo('[source] list already in memory, skip restore')
		} else if (persisted.length) {
			logInfo('[source] restore list from persist len=', persisted.length)
			musicApiStore.setValue(persisted as any)
			const sel = musicApiSelectedStore.getValue() as any
			if (sel && Array.isArray(sel.supportedSources) && sel.supportedSources.length) {
				logInfo('[source] rebind', String(sel.name ?? ''), sel.supportedSources.join('/'))
				try { bindMusicApi(sel) } catch (err) {
					logError('[source] rebind failed', String((err as any)?.message ?? err))
				}
			}
		} else {
			logError('[source] persist empty —— 写入侧可能没写成功')
		}
	}, [])

	useEffect(() => {
		if (!selectedName) return
		appendEvidence(`VISIBLE name=${selectedName} id=${selectedId} sources=${selectedSources || '(none)'}`)
	}, [selectedId, selectedName, selectedSources])

	useEffect(() => {
		if (!urlParam) return
		const token = `${urlParam}|${tParam}`
		if (importedToken.current === token) return
		importedToken.current = token
		setUrlText(urlParam)
		setBusy(true)
		setBanner('正在导入…')
		setBannerOk(false)
		void (async() => {
			try {
				const script = await fetchScriptFromUrl(urlParam)
				await commitScript(script, urlParam)
			} catch (err) {
				if (importedToken.current !== token) return
				const msg = err instanceof Error ? err.message : String(err)
				setBanner(`导入失败：${msg}`)
				setBannerOk(false)
				setBusy(false)
				showToast('导入失败', msg.slice(0, 80), 'error')
				appendEvidence(`IMPORT_FAIL ${msg}`)
			}
		})()
	}, [urlParam, tParam, commitScript])

	const onImportUrl = () => {
		const target = urlText.trim()
		if (!target) {
			setBanner('导入失败：链接为空')
			setBannerOk(false)
			return
		}
		void (async() => {
			try {
				const script = await fetchScriptFromUrl(target)
				await commitScript(script, target)
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				setBanner(`导入失败：${msg}`)
				setBannerOk(false)
				showToast('导入失败', msg.slice(0, 80), 'error')
				appendEvidence(`IMPORT_FAIL ${msg}`)
			}
		})()
	}

	const onImportFile = async() => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: ['text/javascript', 'text/plain', 'public.text', 'public.data'],
				copyToCacheDirectory: true,
			})
			if (result.canceled || !result.assets?.[0]?.uri) return
			const script = await new File(result.assets[0].uri).text()
			await commitScript(script, result.assets[0].uri)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setBanner(`导入失败：${msg}`)
			setBannerOk(false)
			showToast('导入失败', msg.slice(0, 80), 'error')
			appendEvidence(`IMPORT_FAIL ${msg}`)
		}
	}

	const onImportPaste = () => {
		void commitScript(pasteText)
	}

	const onUse = async(id: string) => {
		setBusy(true)
		try {
			await myTrackPlayer.setMusicApiAsSelectedById(id)
			const now = musicApiSelectedStore.getValue()
			if (!now || now.id !== id) throw new Error('音源未进入选中态')
			bindMusicApi(now)
			const sources = formatPlatforms((now as any).supportedSources)
			setBanner(`已使用：${now.name}`)
			setBannerOk(true)
			appendEvidence(`SELECT name=${now.name} id=${now.id} sources=${sources || '(none)'}`)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setBanner(`切换失败：${msg}`)
			setBannerOk(false)
		} finally {
			setBusy(false)
		}
	}

	const onDelete = (id: string) => {
		if (pendingDelete !== id) {
			setPendingDelete(id)
			return
		}
		const list = (musicApiStore.getValue() || []).filter(item => item.id !== id)
		persistList(list)
		if (musicApiSelectedStore.getValue()?.id === id) {
			musicApiSelectedStore.setValue(null)
			PersistStatus.set('music.selectedMusicApi', undefined)
			bindMusicApi(null)
		}
		setPendingDelete(null)
		setBanner('已删除')
		setBannerOk(true)
		showToast('已删除', '音源已移除', 'success')
		appendEvidence(`DELETE id=${id}`)
	}

	const onTest = async(api: IMusic.MusicApi) => {
		setTestNote(prev => ({ ...prev, [api.id]: '测试中…' }))
		const previousId = musicApiSelectedStore.getValue()?.id
		try {
			const reloaded = await myTrackPlayer.reloadMusicApi({ ...api, isSelected: true }, true)
			const sources = formatPlatforms((reloaded as any).supportedSources ?? (api as any).supportedSources)
			const platform = ((reloaded as any).supportedSources?.[0] as string | undefined) || 'kw'
			if (typeof reloaded.getMusicUrl !== 'function') throw new Error('getMusicUrl 不可用')
			const url = await Promise.race([
				reloaded.getMusicUrl('稻香', '周杰伦', '228908', '128k', { requestType: 'test' }, platform),
				new Promise<string>((_, reject) => setTimeout(() => reject(new Error('测试超时')), 12000)),
			])
			const note = url ? `测试通过 ${platform}` : '测试失败：空地址'
			setTestNote(prev => ({ ...prev, [api.id]: note }))
			appendEvidence(`TEST ${note} sources=${sources || '(none)'}`)
			showToast(url ? '测试通过' : '测试失败', note, url ? 'success' : 'error')
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setTestNote(prev => ({ ...prev, [api.id]: `测试失败：${msg}` }))
			appendEvidence(`TEST_FAIL ${msg}`)
			showToast('测试失败', msg.slice(0, 80), 'error')
		} finally {
			if (previousId) {
				await myTrackPlayer.setMusicApiAsSelectedById(previousId).catch(() => undefined)
			}
		}
	}

	const goBack = () => {
		if (router.canGoBack()) router.back()
		else router.replace('/(tabs)/settings' as any)
	}

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 8, flexDirection: 'row', alignItems: 'center' }}>
				<Pressable onPress={goBack} hitSlop={12} style={{ marginRight: 12 }}>
					<Text style={{ color: c.primary, fontSize: macFont.body }}>返回</Text>
				</Pressable>
				<Text style={{ color: c.textStrong, fontSize: macFont.display, fontWeight: '700', flex: 1 }}>{TITLE}</Text>
			</View>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingHorizontal: macSpace.pageX, paddingBottom: insets.bottom + 32 }}
			>
				{banner ? (
					<View style={{
						marginTop: 12,
						padding: 12,
						borderRadius: macRadius.card,
						backgroundColor: bannerOk ? '#E8F6EE' : '#FDECEC',
					}}>
						<Text style={{ color: bannerOk ? c.success : c.danger, fontSize: macFont.body }}>{banner}</Text>
					</View>
				) : null}

				<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: macSpace.section }}>从 URL 导入</Text>
				<TextInput
					value={urlText}
					onChangeText={setUrlText}
					autoCapitalize="none"
					autoCorrect={false}
					placeholder="https:// 或 http:// 脚本地址"
					placeholderTextColor={c.textMuted}
					style={{
						marginTop: 8,
						height: 44,
						borderRadius: macRadius.card,
						paddingHorizontal: 12,
						backgroundColor: c.fillSubtle,
						color: c.text,
						fontSize: macFont.body,
					}}
				/>
				<Pressable
					onPress={onImportUrl}
					disabled={busy}
					style={{
						marginTop: 10,
						height: 44,
						borderRadius: macRadius.pill,
						backgroundColor: c.primary,
						alignItems: 'center',
						justifyContent: 'center',
						opacity: busy ? 0.6 : 1,
					}}
				>
					{busy ? <ActivityIndicator color="#fff" /> : (
						<Text style={{ color: '#fff', fontSize: macFont.body, fontWeight: '600' }}>从 URL 导入</Text>
					)}
				</Pressable>

				<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: macSpace.section }}>从文件导入</Text>
				<Pressable
					onPress={() => { void onImportFile() }}
					disabled={busy}
					style={{
						marginTop: 8,
						height: 44,
						borderRadius: macRadius.card,
						backgroundColor: c.fillSubtle,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Text style={{ color: c.text, fontSize: macFont.body }}>选择 .js 文件</Text>
				</Pressable>

				<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: macSpace.section }}>粘贴文本导入</Text>
				<TextInput
					value={pasteText}
					onChangeText={setPasteText}
					multiline
					autoCapitalize="none"
					autoCorrect={false}
					placeholder="把音源脚本全文粘贴到这里"
					placeholderTextColor={c.textMuted}
					style={{
						marginTop: 8,
						minHeight: 96,
						borderRadius: macRadius.card,
						paddingHorizontal: 12,
						paddingVertical: 10,
						backgroundColor: c.fillSubtle,
						color: c.text,
						fontSize: macFont.body,
						textAlignVertical: 'top',
					}}
				/>
				<Pressable
					onPress={onImportPaste}
					disabled={busy}
					style={{
						marginTop: 10,
						height: 44,
						borderRadius: macRadius.card,
						backgroundColor: c.fillMuted,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<Text style={{ color: c.text, fontSize: macFont.body }}>从文本导入</Text>
				</Pressable>

				<Text style={{ color: c.textStrong, fontSize: macFont.cardTitle, fontWeight: '600', marginTop: macSpace.section }}>
					已导入 {apis.length}
				</Text>
				{apis.length === 0 ? (
					<Text style={{ color: c.textMuted, fontSize: macFont.body, marginTop: 8 }}>还没有音源。导入后即可播放。</Text>
				) : apis.map(api => {
					const active = selected?.id === api.id
					const sources = formatPlatforms((api as any).supportedSources)
					return (
						<View
							key={api.id}
							style={{
								marginTop: 10,
								padding: 12,
								borderRadius: macRadius.card,
								backgroundColor: c.fillSubtle,
								borderWidth: active ? 1 : 0,
								borderColor: c.primary,
							}}
						>
							<Text style={{ color: c.textStrong, fontSize: macFont.cardTitle }}>{api.name || '未命名音源'}</Text>
							<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: 4 }}>
								{api.version || '未知版本'}
								{api.author ? ` · ${api.author}` : ''}
							</Text>
							<Text style={{ color: c.text, fontSize: macFont.body, marginTop: 6 }}>
								支持平台 {sources || '未上报'}
							</Text>
							{testNote[api.id] ? (
								<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: 4 }}>{testNote[api.id]}</Text>
							) : null}
							<View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
								<Pressable
									onPress={() => { void onUse(api.id) }}
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										paddingHorizontal: 12,
										height: 36,
										borderRadius: macRadius.pill,
										backgroundColor: active ? c.primary : c.bg,
									}}
								>
									<View style={{
										width: 14,
										height: 14,
										borderRadius: 7,
										borderWidth: 2,
										borderColor: active ? '#fff' : c.primary,
										alignItems: 'center',
										justifyContent: 'center',
										marginRight: 6,
									}}>
										{active ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} /> : null}
									</View>
									<Text style={{ color: active ? '#fff' : c.primary, fontSize: macFont.caption }}>使用</Text>
								</Pressable>
								<Pressable
									onPress={() => { void onTest(api) }}
									style={{ paddingHorizontal: 12, height: 36, borderRadius: macRadius.pill, backgroundColor: c.bg, justifyContent: 'center' }}
								>
									<Text style={{ color: c.text, fontSize: macFont.caption }}>测试</Text>
								</Pressable>
								<Pressable
									onPress={() => onDelete(api.id)}
									style={{ paddingHorizontal: 12, height: 36, borderRadius: macRadius.pill, backgroundColor: c.bg, justifyContent: 'center' }}
								>
									<Text style={{ color: c.danger, fontSize: macFont.caption }}>
										{pendingDelete === api.id ? '确认删除' : '删除'}
									</Text>
								</Pressable>
							</View>
						</View>
					)
				})}
			</ScrollView>
		</View>
	)
}

export default SourceManageScreen
