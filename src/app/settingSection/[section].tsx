/**
 * 设置分区页：键名与桌面版一致（点分格式），值由 settingsStore 持久化。
 * 桌面版专有分区只做说明，控件照常可读写（配置会保存，只是 iOS 不生效）。
 */
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SettingRow from '@/components/settings/SettingRow'
import SettingSelect from '@/components/settings/SettingSelect'
import SettingSlider from '@/components/settings/SettingSlider'
import SettingSwitch from '@/components/settings/SettingSwitch'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { setSetting, useSetting } from '@/jk/settingsStore'
import { logError, logInfo } from '@/helpers/logger'

const SECTION_TITLES: Record<string, string> = {
	basic: '基本设置',
	player: '播放设置',
	detail: '播放详情页设置',
	desktopLyric: '桌面歌词设置',
	search: '搜索设置',
	list: '列表设置',
	download: '下载设置',
	hotkey: '快捷键设置',
	sync: '数据同步',
	openapi: '开放 API',
	network: '网络设置',
	ocd: '强迫症设置',
	backup: '备份与恢复',
	other: '其他',
}

const DESKTOP_ONLY: Record<string, string> = {
	desktopLyric: '桌面歌词仅桌面版支持，这里的配置会被保存但不会生效。',
	hotkey: '快捷键仅桌面版支持，这里的配置会被保存但不会生效。',
	openapi: '开放 API 需要常驻监听端口，iOS 不支持，配置会被保存但不生效。',
	sync: '数据同步需要常驻服务端，当前版本未实现。',
}

const BasicSection = () => {
	const [lang, setLang] = useSetting('common.langId', 'zh-cn')
	const [theme, setTheme] = useSetting('theme.id', 'auto')
	const [fontSize, setFontSize] = useSetting('common.fontSize', 'normal')
	const [glass, setGlass] = useSetting('common.glassBlur', true)
	const [sourceName, setSourceName] = useSetting('common.sourceNameType', 'full')
	return (
		<>
			<SettingRow label="语言"><SettingSelect value={lang} onChange={setLang} options={[
				{ value: 'zh-cn', label: '中文' }, { value: 'en-us', label: 'English' },
			]} /></SettingRow>
			<SettingRow label="主题"><SettingSelect value={theme} onChange={setTheme} options={[
				{ value: 'auto', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' },
			]} /></SettingRow>
			<SettingRow label="字号"><SettingSelect value={fontSize} onChange={setFontSize} options={[
				{ value: 'small', label: '小' }, { value: 'normal', label: '标准' }, { value: 'large', label: '大' },
			]} /></SettingRow>
			<SettingRow label="玻璃模糊"><SettingSwitch value={glass} onChange={setGlass} /></SettingRow>
			<SettingRow label="显示源名"><SettingSelect value={sourceName} onChange={setSourceName} options={[
				{ value: 'full', label: '原名' }, { value: 'short', label: '缩写' },
			]} /></SettingRow>
		</>
	)
}

const PlayerSection = () => {
	const [quality, setQuality] = useSetting('player.playQuality', '320k')
	const [volume, setVolume] = useSetting('player.volume', 1)
	const [rate, setRate] = useSetting('player.playbackRate', 1)
	const [saveTime, setSaveTime] = useSetting('player.isSavePlayTime', true)
	const [autoSkip, setAutoSkip] = useSetting('player.autoSkipOnError', true)
	const [stopEnd, setStopEnd] = useSetting('player.waitPlayEndStop', false)
	const [showTrans, setShowTrans] = useSetting('player.isShowLyricTranslation', false)
	const [showRoma, setShowRoma] = useSetting('player.isShowLyricRoma', false)
	return (
		<>
			<SettingRow label="音质"><SettingSelect value={quality} onChange={setQuality} options={[
				{ value: '128k', label: '128k' }, { value: '320k', label: '320k' }, { value: 'flac', label: 'flac' },
			]} /></SettingRow>
			<SettingRow label="音量"><SettingSlider value={Number(volume)} min={0} max={1} step={0.01} onChange={setVolume} format={v => `${Math.round(v * 100)}%`} /></SettingRow>
			<SettingRow label="播放倍速"><SettingSlider value={Number(rate)} min={0.5} max={2} step={0.1} onChange={setRate} format={v => `${v.toFixed(1)}x`} /></SettingRow>
			<SettingRow label="保存播放进度"><SettingSwitch value={saveTime} onChange={setSaveTime} /></SettingRow>
			<SettingRow label="自动跳过错误曲目"><SettingSwitch value={autoSkip} onChange={setAutoSkip} /></SettingRow>
			<SettingRow label="播放结束停止"><SettingSwitch value={stopEnd} onChange={setStopEnd} /></SettingRow>
			<SettingRow label="显示歌词翻译"><SettingSwitch value={showTrans} onChange={setShowTrans} /></SettingRow>
			<SettingRow label="显示歌词音译"><SettingSwitch value={showRoma} onChange={setShowRoma} /></SettingRow>
		</>
	)
}

const ListSection = () => {
	const [actionBtns, setActionBtns] = useSetting('list.actionButtonsVisible', true)
	const [clickPlay, setClickPlay] = useSetting('list.isClickPlayList', true)
	const [showSource, setShowSource] = useSetting('list.isShowSource', true)
	const [saveScroll, setSaveScroll] = useSetting('list.isSaveScrollLocation', true)
	const [addPos, setAddPos] = useSetting('list.addMusicLocationType', 'top')
	return (
		<>
			<SettingRow label="显示操作按钮"><SettingSwitch value={actionBtns} onChange={setActionBtns} /></SettingRow>
			<SettingRow label="点击整行播放"><SettingSwitch value={clickPlay} onChange={setClickPlay} /></SettingRow>
			<SettingRow label="显示来源"><SettingSwitch value={showSource} onChange={setShowSource} /></SettingRow>
			<SettingRow label="记住滚动位置"><SettingSwitch value={saveScroll} onChange={setSaveScroll} /></SettingRow>
			<SettingRow label="添加音乐位置"><SettingSelect value={addPos} onChange={setAddPos} options={[
				{ value: 'top', label: '顶部' }, { value: 'bottom', label: '底部' },
			]} /></SettingRow>
		</>
	)
}

const NetworkSection = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const [proxyEnable, setProxyEnable] = useSetting('network.proxy.enable', false)
	const [proxyHost, setProxyHost] = useSetting('network.proxy.host', '')
	const [proxyPort, setProxyPort] = useSetting('network.proxy.port', 8080)
	const [maxDl, setMaxDl] = useSetting('download.maxDownloadNum', 3)
	const [timeoutMs, setTimeoutMs] = useSetting('_ios.requestTimeoutMs', 15000)
	return (
		<>
			<Text style={{ color: c.textMuted, fontSize: macFont.caption, paddingHorizontal: macSpace.pageX, paddingBottom: 10 }}>
				iOS 端暂不支持系统级代理，配置会保存但不生效（仅桌面版可用）
			</Text>
			<SettingRow label="启用代理" hint="仅保存，不生效">
				<SettingSwitch value={proxyEnable} onChange={setProxyEnable} />
			</SettingRow>
			<SettingRow label="代理地址" hint="仅保存，不生效">
				<SettingSelect
					value={String(proxyHost || 'none')}
					onChange={(v) => setProxyHost(v === 'none' ? '' : v)}
					options={[{ value: 'none', label: '未设置' }, { value: '127.0.0.1', label: '127.0.0.1' }]}
				/>
			</SettingRow>
			<SettingRow label="代理端口" hint="仅保存，不生效">
				<Text style={{ color: c.textMuted, fontSize: macFont.body }}>{String(proxyPort)}</Text>
			</SettingRow>
			<SettingRow label="并发下载数" hint="影响下载/预取队列上限">
				<SettingSelect
					value={String(maxDl)}
					onChange={(v) => setMaxDl(Number(v))}
					options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]}
				/>
			</SettingRow>
			<SettingRow label="请求超时" hint="影响音源解析与下载">
				<SettingSelect
					value={String(timeoutMs)}
					onChange={(v) => setTimeoutMs(Number(v))}
					options={[{ value: '10000', label: '10 秒' }, { value: '15000', label: '15 秒' }, { value: '30000', label: '30 秒' }]}
				/>
			</SettingRow>
			<Text style={{ color: c.textMuted, fontSize: macFont.badge, paddingHorizontal: macSpace.pageX, paddingTop: 12 }}>
				当前：并发 {String(maxDl)} · 超时 {String(timeoutMs)}ms
			</Text>
		</>
	)
}

const OtherSection = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const router = useRouter()
	const [confirm, setConfirm] = React.useState(false)
	const [status, setStatus] = React.useState('')
	const version = '1.0.0'
	const build = '1'

	const wipeAll = async() => {
		try {
			const FS = await import('expo-file-system/legacy')
			const cm = await import('@/player/CacheManager')
			await cm.clearCache()
			await FS.deleteAsync(`${FS.documentDirectory}mmkv`, { idempotent: true }).catch(() => undefined)
			setStatus('已清空缓存与设置，请手动重启 App 生效')
		} catch (err: any) {
			setStatus(`清空失败：${err?.message ?? err}`)
		}
		setConfirm(false)
	}

	return (
		<>
			<SettingRow label="App 版本"><Text style={{ color: c.textMuted, fontSize: macFont.body }}>{version} ({build})</Text></SettingRow>
			<SettingRow label="播放引擎"><Text style={{ color: c.textMuted, fontSize: macFont.body }}>RNTP + JSC</Text></SettingRow>
			<SettingRow label="查看日志">
				<Pressable onPress={() => router.push('/logScreen' as any)}>
					<Text style={{ color: c.primary, fontSize: macFont.body }}>打开 ›</Text>
				</Pressable>
			</SettingRow>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 16 }}>
				<Pressable onPress={() => setConfirm(true)} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
					<Text style={{ color: c.danger, fontSize: macFont.body }}>清空所有数据</Text>
				</Pressable>
				{status ? <Text style={{ color: c.primary, fontSize: macFont.caption, marginTop: 8 }}>{status}</Text> : null}

			</View>
			{confirm ? (
				<View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
					<View style={{ backgroundColor: c.bg, borderRadius: 12, padding: 20, width: '100%' }}>
						<Text style={{ color: c.textStrong, fontSize: macFont.body, marginBottom: 8 }}>确认清空所有数据？</Text>
						<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginBottom: 16 }}>将删除缓存与全部设置，不可撤销。</Text>
						<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
							<Pressable onPress={() => setConfirm(false)}><Text style={{ color: c.textMuted, fontSize: macFont.body }}>取消</Text></Pressable>
							<Pressable onPress={wipeAll}><Text style={{ color: c.danger, fontSize: macFont.body }}>确认清空</Text></Pressable>
						</View>
					</View>
				</View>
			) : null}
		</>
	)
}

const SearchSection = () => {
	const [hot, setHot] = useSetting('search.isShowHotSearch', true)
	const [history, setHistory] = useSetting('search.isShowHistorySearch', true)
	const [focus, setFocus] = useSetting('search.isFocusSearchBox', false)
	return (
		<>
			<SettingRow label="显示热门搜索"><SettingSwitch value={hot} onChange={setHot} /></SettingRow>
			<SettingRow label="显示历史搜索"><SettingSwitch value={history} onChange={setHistory} /></SettingRow>
			<SettingRow label="进入时聚焦搜索框"><SettingSwitch value={focus} onChange={setFocus} /></SettingRow>
		</>
	)
}

const OdcSection = () => {
	const [clearInput, setClearInput] = useSetting('odc.isAutoClearSearchInput', false)
	const [clearList, setClearList] = useSetting('odc.isAutoClearSearchList', false)
	return (
		<>
			<SettingRow label="离开搜索页清空输入" hint="回到搜索页时输入框为空">
				<SettingSwitch value={clearInput} onChange={setClearInput} />
			</SettingRow>
			<SettingRow label="离开搜索页清空结果" hint="回到搜索页时结果列表为空">
				<SettingSwitch value={clearList} onChange={setClearList} />
			</SettingRow>
		</>
	)
}

const PlayDetailSection = () => {
	const [blur, setBlur] = useSetting('playDetail.bgBlur', 0.6)
	const [opacity, setOpacity] = useSetting('playDetail.bgOpacity', 0.5)
	const [zoom, setZoom] = useSetting('playDetail.isZoomActiveLrc', true)
	const [delay, setDelay] = useSetting('playDetail.isDelayScroll', false)
	return (
		<>
			<SettingRow label="背景模糊" hint="0 = 无模糊，1 = 最强">
				<SettingSlider value={Number(blur)} min={0} max={1} step={0.05} onChange={setBlur} format={v => `${Math.round(v * 100)}%`} />
			</SettingRow>
			<SettingRow label="背景遮罩" hint="0 = 透明，1 = 全黑">
				<SettingSlider value={Number(opacity)} min={0} max={1} step={0.05} onChange={setOpacity} format={v => `${Math.round(v * 100)}%`} />
			</SettingRow>
			<SettingRow label="歌词当前行放大"><SettingSwitch value={zoom} onChange={setZoom} /></SettingRow>
			<SettingRow label="歌词滚动延迟"><SettingSwitch value={delay} onChange={setDelay} /></SettingRow>
		</>
	)
}

const DownloadSection = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const [size, setSize] = React.useState(0)
	const [count, setCount] = React.useState(0)
	const [limitMb, setLimitMb] = useSetting('download.cacheLimitMb', 500)
	const [status, setStatus] = React.useState('')
	const [showGoFavorites, setShowGoFavorites] = React.useState(false)
	const router = useRouter()

	const refresh = React.useCallback(async() => {
		const cm = await import('@/player/CacheManager')
		const total = await cm.getCacheSize()
		setSize(total)
		try {
			const FS = await import('expo-file-system/legacy')
			const names: string[] = await FS.readDirectoryAsync(cm.cacheDir)
			setCount(names.filter((n: string) => !n.endsWith('.part')).length)
		} catch { setCount(0) }
	}, [])

	React.useEffect(() => { void refresh() }, [refresh])

	const clearAll = async() => {
		try {
			const cm = await import('@/player/CacheManager')
			await cm.clearCache()
			await refresh()
			setStatus('已清理缓存')
		} catch (err: any) {
			setStatus(`清理失败：${err?.message ?? err}`)
		}
	}

	const mb = (size / 1024 / 1024).toFixed(1)

	return (
		<>
			<SettingRow label="缓存占用" hint={`${count} 个文件`}>
				<Text style={{ color: c.textMuted, fontSize: macFont.body }}>{mb} MB</Text>
			</SettingRow>
			<SettingRow label="缓存上限" hint="超出后按最久未使用淘汰">
				<SettingSelect
					value={String(limitMb)}
					onChange={(v) => setLimitMb(Number(v))}
					options={[
						{ value: '200', label: '200 MB' }, { value: '500', label: '500 MB' },
						{ value: '1024', label: '1 GB' }, { value: '2048', label: '2 GB' },
					]}
				/>
			</SettingRow>
			<SettingRow label="dev 标志" hint={`forceBadUrl=${String(useSetting('_dev.forceBadUrl', false)[0])} slowBufferMs=${String(useSetting('_dev.slowBufferMs', 0)[0])}`}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>—</Text>
			</SettingRow>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 12 }}>
				<Pressable onPress={clearAll} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
					<Text style={{ color: c.text, fontSize: macFont.body }}>清理缓存</Text>
				</Pressable>
				{status ? <Text style={{ color: c.primary, fontSize: macFont.caption, marginTop: 8 }}>{status}</Text> : null}
				{showGoFavorites ? (
					<Pressable
						onPress={() => router.push('/(tabs)/favorites' as any)}
						style={({ pressed }) => ({ marginTop: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}
					>
						<Text style={{ color: c.text, fontSize: macFont.body }}>查看我的列表</Text>
					</Pressable>
				) : null}
			</View>
		</>
	)
}

const BackupSection = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const router = useRouter()
	const [status, setStatus] = React.useState<string>('')
	const [showGoFavorites, setShowGoFavorites] = React.useState(false)
	const [total, setTotal] = React.useState<number>(0)
	const [lastPath, setLastPath] = React.useState<string>('')

	React.useEffect(() => {
		import('@/jk/settingsStore').then(m => setTotal(Object.keys(m.getAllSettings()).length))
	}, [])

	const doExportSetting = async() => {
		try {
			const { exportSetting, writeBackupFile } = await import('@/jk/backup')
			const obj = await exportSetting()
			const uri = await writeBackupFile('lx_setting_v2', obj)
			setLastPath(uri)
			setStatus(`已导出 ${Object.keys(obj.data).length} 项 → ${uri}`)
		} catch (err: any) {
			setStatus(`导出失败：${err?.message ?? err}`)
		}
	}

	const doExportAll = async() => {
		try {
			const { exportAllData, writeBackupFile } = await import('@/jk/backup')
			const obj = await exportAllData()
			const uri = await writeBackupFile('lx_datas_v2', obj)
			setLastPath(uri)
			setStatus(`已导出全部数据 → ${uri}`)
		} catch (err: any) {
			setStatus(`导出失败：${err?.message ?? err}`)
		}
	}

	const doExportPlayList = async() => {
		try {
			const { exportPlayList, writeBackupFile } = await import('@/jk/backup')
			const obj = await exportPlayList()
			const uri = await writeBackupFile('lx_list_v2', obj)
			setLastPath(uri)
			setStatus(`已导出 ${obj.data.length} 个歌单 → ${uri}`)
		} catch (err: any) {
			setStatus(`导出失败：${err?.message ?? err}`)
		}
	}

	const pickAndImport = async(kind: 'setting' | 'all' | 'playlist') => {
		try {
			const DocumentPicker = await import('expo-document-picker')
			const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
			if (picked.canceled || !picked.assets?.[0]) return
			const uri = picked.assets[0].uri
			const { readBackupFile, importSetting, importAllData, importPlayList } = await import('@/jk/backup')
			const obj = await readBackupFile(uri)
			if (kind === 'playlist') {
				if (obj.type !== 'playList_v2') throw new Error(`类型不匹配：${obj.type}`)
				const r = importPlayList(obj.data)
				setStatus(`导入歌单：新增 ${r.lists} 个，合并 ${r.merged} 个，新增歌曲 ${r.songs} 首`)
			} else if (kind === 'setting') {
				if (obj.type !== 'setting_v2') throw new Error(`类型不匹配：${obj.type}`)
				const r = importSetting(obj.data)
				setStatus(`导入设置：成功 ${r.applied} 项，跳过 ${r.skipped} 项`)
			} else {
				const r = importAllData(obj)
				const pl: any = (r as any).playListResult ?? { lists: 0, merged: 0, songs: 0 }
				if (!r.playListCount) {
					setStatus(`备份中没有歌单。设置 ${r.setting.applied} 项（跳过 ${r.setting.skipped}）`)
				} else {
					setStatus(`设置 ${r.setting.applied} 项（跳过 ${r.setting.skipped}），歌单 ${r.playListCount} 个（新增 ${pl.lists} / 合并 ${pl.merged}），歌曲 ${pl.songs} 首`)
					setShowGoFavorites(true)
				}
			}
			const m = await import('@/jk/settingsStore')
			setTotal(Object.keys(m.getAllSettings()).length)
		} catch (err: any) {
			setStatus(`导入失败：${err?.message ?? err}`)
		}
	}

	const btn = (label: string, onPress: () => void) => (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => ({
				paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10,
				backgroundColor: pressed ? c.fillMuted : c.fillSubtle, marginBottom: 10,
			})}
		>
			<Text style={{ color: c.text, fontSize: macFont.body }}>{label}</Text>
		</Pressable>
	)

	return (
		<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 12 }}>
			{btn('导出设置', doExportSetting)}
			{btn('导入设置', () => pickAndImport('setting'))}
			{btn('导出全部数据', doExportAll)}
			{btn('导入全部数据', () => pickAndImport('all'))}
			{btn('导出歌单', doExportPlayList)}
			{btn('导入歌单', () => pickAndImport('playlist'))}
			<View style={{ marginTop: 16, gap: 4 }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>当前设置项总数：{total}</Text>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>上次导出：{lastPath || '—'}</Text>
				{status ? <Text style={{ color: c.primary, fontSize: macFont.caption, marginTop: 8 }}>{status}</Text> : null}
				{showGoFavorites ? (
					<Pressable
						onPress={() => router.push('/(tabs)/favorites' as any)}
						style={({ pressed }) => ({ marginTop: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}
					>
						<Text style={{ color: c.text, fontSize: macFont.body }}>查看我的列表</Text>
					</Pressable>
				) : null}
			</View>
		</View>
	)
}

const SettingsSectionScreen = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const insets = useSafeAreaInsets()
	const router = useRouter()
	const params = useLocalSearchParams<{ section: string, setKey?: string, setValue?: string }>()

	// dev-only 写入钩子：仅 EXPO_PUBLIC_JK_DEV_IMPORT=1 的构建生效，正式包完全不执行
	React.useEffect(() => {
		if (process.env.EXPO_PUBLIC_JK_DEV_IMPORT !== '1') return
		const key = params.setKey
		const raw = params.setValue
		if (!key || raw == null) return
		const parseValue = (v: string) => {
			if (v === 'true') return true
			if (v === 'false') return false
			if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
			return v
		}
		const value = parseValue(String(raw))
		setSetting(String(key), value)
		logInfo(`[jk/settings] dev write ${key}=${String(raw)}`)
	}, [params.setKey, params.setValue])

	const paramsKey = JSON.stringify(params)
	const [devStatus, setDevStatus] = React.useState('')

	// dev-only 动作钩子：?action=export / exportAll，用于无点击环境下验收备份
	React.useEffect(() => {
		if (process.env.EXPO_PUBLIC_JK_DEV_IMPORT !== '1') return
		const action = (params as any).action
		if (!action) return
		setDevStatus(`last action=${action} at ${new Date().toLocaleTimeString()}`)
		void (async() => {
			try {
				const backup = await import('@/jk/backup')
				if (action === 'export') {
					const obj = await backup.exportSetting()
					const uri = await backup.writeBackupFile('lx_setting_v2', obj)
					logInfo('[jk/backup] dev export', uri, Object.keys(obj.data).length)
				} else if (action === 'exportPlayList') {
					const obj = await backup.exportPlayList()
					const uri = await backup.writeBackupFile('lx_list_v2', obj)
					logInfo('[jk/backup] dev exportPlayList', uri, obj.data.length)
				} else if (action === 'searchSource' || action === 'searchSubmit') {
					const pill = String((params as any).pill ?? 'all')
					const q = String((params as any).q ?? '')
					const g: any = globalThis
					g.__jkSearchCmd = { kind: action, pill, q, at: Date.now() }
					logInfo(`[dev] action=${action} pill=${pill} q=${q} ok`)
				} else if (action === 'hotFail') {
					const v = String((params as any).value ?? 'true') === 'true'
					setSetting('_dev.hotFail', v)
					logInfo(`[dev] action=hotFail value=${v} ok`)
				} else if (action === 'nav') {
					const to = String((params as any).to ?? 'search')
					logInfo(`[dev] action=nav to=${to} ok`)
					router.push(`/(tabs)/${to}` as any)
				} else if (action === 'stress') {
					const scenario = String((params as any).scenario ?? 'lru') as any
					const n = Number((params as any).n ?? 6) || 6
					const { runStress } = await import('@/jk/devStress')
					const result = await runStress(scenario, n, (msg) => setDevStatus(msg))
					setDevStatus(`stress ${scenario} pass=${result.pass} ${result.detail}`)
				} else if (action === 'playnow') {
					// 不导航、不改路由，纯函数式触发播放（批量压测最稳）
					const src = String((params as any).source ?? 'kw')
					const listId = String((params as any).list ?? '')
					const idx = Math.max(0, Number((params as any).index ?? 0) || 0)
					const { getSongListDetail } = await import('@/jk/musicSdk')
					const { jkToTrack } = await import('@/jk/adapt')
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					const res: any = await getSongListDetail(src as any, listId, 1)
					const tracks: any[] = (res?.list ?? []).map((m: any) => jkToTrack(m))
					if (!tracks.length) throw new Error('歌单为空')
					const target = tracks[Math.min(idx, tracks.length - 1)]
					logInfo(`[jk/play] playnow src=${src} idx=${idx} title=${target?.title ?? ''}`)
					await (tp as any).playWithReplacePlayList(target, tracks)
				} else if (action === 'setdev') {
					const k = String((params as any).key ?? '')
					const rawV = String((params as any).value ?? '')
					if (!k) throw new Error('缺少 key')
					const parsed = rawV === 'true' ? true : rawV === 'false' ? false
						: (/^-?\d+(\.\d+)?$/.test(rawV) ? Number(rawV) : rawV)
					setSetting(k, parsed)
					logInfo(`[jk/dev] set ${k}=${rawV}`)
				} else if (action === 'cleardev') {
					setSetting('_dev.forceBadUrl', false)
					setSetting('_dev.slowBufferMs', 0)
					setSetting('download.cacheLimitMb', 500)
					logInfo('[jk/dev] 已清理 dev 标志')
				} else if (action === 'badurl') {
					const g3: any = globalThis
					g3.__JK_FORCE_BAD_URL__ = 'https://127.0.0.1:9/x.mp3'
					logInfo('[jk/play] 已开启坏 URL 实验（下次播放强制失败）')
				} else if (action === 'slowbuffer') {
					const ms = Number((params as any).ms ?? 1500)
					;(globalThis as any).__JK_SLOW_BUFFER_MS__ = ms
					logInfo('[jk/play] 慢速缓冲开关 ms=', String(ms))
				} else if (action === 'plain') {
					const url = String((params as any).url ?? '')
					if (!url) throw new Error('缺少 url 参数')
					const { playPlain } = await import('@/player/plainPlay')
					await playPlain(url)
				} else if (action === 'playtest') {
					// 管线对照：不经过音源脚本，直接用一个最小 Track 播放公开 mp3
					const url = String((params as any).url ?? '')
					if (!url) throw new Error('缺少 url 参数')
					const track: any = {
						id: 'playtest', platform: 'test', title: '管线测试曲', artist: 'playtest',
						duration: 0, artwork: '', url, source: 'test',
					}
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					logInfo('[jk/play] playtest url =', url.slice(0, 120))
					await (tp as any).playWithReplacePlayList(track, [track])
				} else if (action === 'forceRemote') {
					const g1: any = globalThis
					g1.__JK_FORCE_REMOTE__ = true
					logInfo('[jk/play] 已开启强制远程（忽略缓存）')
				} else if (action === 'allowCache') {
					const g2: any = globalThis
					g2.__JK_FORCE_REMOTE__ = false
					logInfo('[jk/play] 已恢复使用缓存')
				} else if (action === 'import') {
					const path = String((params as any).path ?? '')
					if (!path) throw new Error('缺少 path 参数')
					const obj = await backup.readBackupFile(path)
					if (obj.type === 'setting_v2') {
						const r = backup.importSetting(obj.data)
						logInfo(`[jk/backup] import ok applied=${r.applied} skipped=${r.skipped} type=${obj.type}`)
					} else if (obj.type === 'allData_v2') {
						const r = backup.importAllData(obj)
						logInfo(`[jk/backup] import ok applied=${r.setting.applied} skipped=${r.setting.skipped} playList=${r.playListCount} type=${obj.type}`)
					} else if (obj.type === 'playList_v2') {
						const r = backup.importPlayList(obj.data)
						logInfo(`[jk/backup] import ok lists=${r.lists} merged=${r.merged} songs=${r.songs} type=${obj.type}`)
					} else {
						throw new Error(`该类型暂不支持导入：${obj.type}`)
					}
				} else if (action === 'exportAll') {
					const obj = await backup.exportAllData()
					const uri = await backup.writeBackupFile('lx_datas_v2', obj)
					logInfo('[jk/backup] dev exportAll', uri)
				}
			} catch (err: any) {
				logError('[jk/backup] dev action failed', String(err?.message ?? err))
			}
		})()
	}, [paramsKey])
	const section = String(params.section ?? 'basic')
	const title = SECTION_TITLES[section] ?? section
	const note = DESKTOP_ONLY[section]

	const content = (() => {
		if (section === 'basic') return <BasicSection />
		if (section === 'player') return <PlayerSection />
		if (section === 'list') return <ListSection />
		if (section === 'backup') return <BackupSection />
		if (section === 'download') return <DownloadSection />
		if (section === 'detail') return <PlayDetailSection />
		if (section === 'search') return <SearchSection />
		if (section === 'ocd') return <OdcSection />
		if (section === 'other') return <OtherSection />
		if (section === 'network') return <NetworkSection />
		return null
	})()

	return (
		<View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: macSpace.pageX, paddingVertical: 10 }}>
				<Pressable onPress={() => router.back()} hitSlop={8}>
					<Text style={{ color: c.primary, fontSize: macFont.body }}>‹ 返回</Text>
				</Pressable>
				<Text style={{ color: c.textStrong, fontSize: macFont.pageTitle, fontWeight: '600' }}>{title}</Text>
			</View>
			{devStatus ? (
				<Text style={{ color: c.primary, fontSize: 11, paddingHorizontal: macSpace.pageX, paddingBottom: 6 }}>
					{devStatus}
				</Text>
			) : null}
			{note ? (
				<Text style={{ color: c.textMuted, fontSize: macFont.caption, paddingHorizontal: macSpace.pageX, paddingBottom: 10 }}>
					{note}
				</Text>
			) : null}
			<ScrollView>
				{content ?? (
					<Text style={{ color: c.textMuted, fontSize: macFont.body, padding: macSpace.pageX }}>
						该分区将在后续版本提供
					</Text>
				)}
			</ScrollView>
		</View>
	)
}

export default SettingsSectionScreen
