import { nowLanguage, changeLanguage } from '@/utils/i18n'
import { MAC_THEMES, ACCENT_PRESETS, macThemeStore, accentStore, wallpaperStore, setMacTheme, setAccentColor, setWallpaper, getWallpaperUri, themeName, type MacThemeId } from '@/jk/themeStore'
/**
 * 设置分区页：键名与桌面版一致（点分格式），值由 settingsStore 持久化。
 * 桌面版专有分区只做说明，控件照常可读写（配置会保存，只是 iOS 不生效）。
 */
import React from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SettingRow from '@/components/settings/SettingRow'
import SettingSelect from '@/components/settings/SettingSelect'
import SettingSlider from '@/components/settings/SettingSlider'
import SettingSwitch from '@/components/settings/SettingSwitch'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { useAppTheme, useThemeMode } from '@/hooks/useAppTheme'
import { setSetting, useSetting } from '@/jk/settingsStore'
import { showToast } from '@/utils/utils'
import { logError, logInfo } from '@/helpers/logger'
import { getSectionTitle, getSectionNote } from '@/jk/settingsSections'
import { tr } from '@/utils/i18n'

const BasicSection = () => {
	// 语言/主题写真正被消费的键；强调色与壁纸独立于主题
	const lang = nowLanguage.useValue()
	const macTheme = macThemeStore.useValue()
	const accent = accentStore.useValue()
	const wallpaper = wallpaperStore.useValue()
	const { themeMode, setThemeMode } = useThemeMode()
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	// 键值语义与桌面版一致：fontSize 是 px 数值，glassBlur 是 0..1，sourceNameType 是 alias/real
	const [fontSize, setFontSize] = useSetting('common.fontSize', 16)
	const [glass, setGlass] = useSetting('common.glassBlur', 0)
	const [sourceName, setSourceName] = useSetting('common.sourceNameType', 'alias')

	const pickWallpaper = async() => {
		try {
			const ImagePicker = await import('expo-image-picker')
			const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
			if (!perm.granted) {
				showToast(tr('提示', 'Notice'), tr('需要相册权限才能选择壁纸', 'Photo library permission is required'), 'error')
				return
			}
			const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.9 })
			if (res.canceled || !res.assets?.[0]?.uri) return
			const FS = await import('expo-file-system/legacy')
			const dest = `${(FS as any).documentDirectory}wallpaper.jpg`
			await (FS as any).copyAsync({ from: res.assets[0].uri, to: dest })
			// 只存文件名：绝对路径在重装后会指向旧容器
			setWallpaper({ uri: 'wallpaper.jpg' })
			showToast(tr('已设置', 'Done'), tr('主题壁纸已更新', 'Wallpaper updated'), 'success')
		} catch (err) {
			showToast(tr('设置失败', 'Failed'), String((err as any)?.message ?? err).slice(0, 60), 'error')
		}
	}

	return (
		<>
			<SettingRow label={tr('语言', 'Language')}><SettingSelect
				value={lang === 'en' ? 'en' : 'zh'}
				onChange={(v) => changeLanguage(v)}
				options={[{ value: 'zh', label: tr('中文', 'Chinese') }, { value: 'en', label: 'English' }]}
			/></SettingRow>
			<SettingRow label={tr('外观', 'Appearance')}><SettingSelect
				value={themeMode}
				onChange={(v) => setThemeMode(v as any)}
				options={[
					{ value: 'system', label: tr('跟随系统', 'System') },
					{ value: 'light', label: tr('浅色', 'Light') },
					{ value: 'dark', label: tr('深色', 'Dark') },
				]}
			/></SettingRow>
			<SettingRow label={tr('主题', 'Theme')}><SettingSelect
				value={macTheme.id}
				onChange={(v) => setMacTheme(v as MacThemeId)}
				options={(Object.keys(MAC_THEMES) as MacThemeId[]).map(id => ({ value: id, label: themeName(id) }))}
			/></SettingRow>
			{/* 强调色：控制字体/进度条/按钮等「强调」用色；留空则跟随主题预设 */}
			<SettingRow
				label={tr('强调色', 'Accent Color')}
				hint={accent ? tr('自定义', 'Custom') : `${tr('跟随主题', 'Follows theme')} · ${themeName(macTheme.id)}`}
			>
				<View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: accent || macTheme.primary, borderWidth: 0.5, borderColor: c.divider }} />
			</SettingRow>
			<View style={{
				paddingHorizontal: macSpace.pageX, paddingVertical: 12,
				borderBottomWidth: 0.5, borderBottomColor: c.divider,
			}}>
				{/* 预设色板：一行 8 个，选中打勾；下面单独给「跟随主题」一个明确入口 */}
				<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
					{ACCENT_PRESETS.map(color => {
						const active = accent === color
						return (
							<Pressable
								key={color}
								onPress={() => setAccentColor(active ? '' : color)}
								hitSlop={4}
								style={{
									width: 30, height: 30, borderRadius: 15, backgroundColor: color,
									alignItems: 'center', justifyContent: 'center',
									borderWidth: active ? 2 : 0, borderColor: c.textStrong,
								}}
							>
								{active ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
							</Pressable>
						)
					})}
				</View>
				<Pressable
					onPress={() => setAccentColor('')}
					style={{ marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5 }}
				>
					<Ionicons name={accent ? 'refresh-outline' : 'checkmark-circle'} size={14} color={c.primary} />
					<Text style={{ color: c.primary, fontSize: macFont.caption }}>
						{accent ? `${tr('恢复跟随主题', 'Follow theme')} · ${themeName(macTheme.id)}` : tr('当前跟随主题', 'Following theme')}
					</Text>
				</Pressable>
			</View>
			<SettingRow label={tr('主题壁纸', 'Wallpaper')} hint={wallpaper.uri ? tr('仅播放页生效', 'Now Playing page only') : tr('选择一张图片作为播放页背景', 'Pick an image for the Now Playing background')}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
					{wallpaper.uri ? (
						<Image source={{ uri: getWallpaperUri(wallpaper.uri) }} style={{ width: 46, height: 28, borderRadius: 6, borderWidth: 0.5, borderColor: c.divider }} />
					) : null}
					<Pressable onPress={() => { void pickWallpaper() }}>
						<Text style={{ color: c.primary, fontSize: macFont.body }}>{tr('选择图片', 'Choose Image')}</Text>
					</Pressable>
					{wallpaper.uri ? (
						<Pressable onPress={() => setWallpaper({ uri: '' })}>
							<Text style={{ color: c.danger, fontSize: macFont.body }}>{tr('清除', 'Clear')}</Text>
						</Pressable>
					) : null}
				</View>
			</SettingRow>
			{wallpaper.uri ? (
				<>
					<SettingRow label={tr('壁纸磨砂', 'Wallpaper Blur')}>
						<SettingSlider value={wallpaper.blur} min={0} max={40} step={1} onChange={(v) => setWallpaper({ blur: v })} format={(v) => `${Math.round(v)}`} />
					</SettingRow>
					<SettingRow label={tr('壁纸不透明度', 'Wallpaper Opacity')}>
						<SettingSlider value={wallpaper.opacity} min={10} max={100} step={1} onChange={(v) => setWallpaper({ opacity: v })} format={(v) => `${Math.round(v)}%`} />
					</SettingRow>
				</>
			) : null}
			<SettingRow label={tr('字号', 'Font Size')}><SettingSelect value={String(Number(fontSize) || 16)} onChange={(v) => setFontSize(Number(v) as any)} options={[
				{ value: '14', label: tr('小', 'Small') }, { value: '16', label: tr('标准', 'Standard') }, { value: '18', label: tr('大', 'Large') },
			]} /></SettingRow>
			<SettingRow label={tr('玻璃模糊', 'Glass Blur')}><SettingSwitch value={Number(glass) > 0} onChange={(v) => setGlass((v ? 1 : 0) as any)} /></SettingRow>
			<SettingRow label={tr('显示源名', 'Source Name Type')}><SettingSelect value={sourceName === 'real' ? 'real' : 'alias'} onChange={(v) => setSourceName(v as any)} options={[
				{ value: 'real', label: tr('原名', 'Full') }, { value: 'alias', label: tr('缩写', 'Alias') },
			]} /></SettingRow>
		</>
	)
}

const PlayerSection = () => {
	// 以 music.quality 为唯一真源（播放链路读 qualityStore）；player.playQuality 仅桌面兼容
	const [quality, setQualityRaw] = useSetting('music.quality', '128k')
	const setQuality = React.useCallback(async(v: string) => {
		setQualityRaw(v)
		setSetting('player.playQuality', v)
		try {
			const { default: tp } = await import('@/helpers/trackPlayerIndex')
			;(tp as any).setQuality?.(v)
		} catch { /* ignore */ }
	}, [setQualityRaw])
	const [volume, setVolume] = useSetting('player.volume', 1)
	const [rate, setRate] = useSetting('player.playbackRate', 1)
	const [saveTime, setSaveTime] = useSetting('player.isSavePlayTime', true)
	const [autoSkip, setAutoSkip] = useSetting('player.autoSkipOnError', true)
	const [stopEnd, setStopEnd] = useSetting('player.waitPlayEndStop', false)
	const [showTrans, setShowTrans] = useSetting('player.isShowLyricTranslation', false)
	const [showRoma, setShowRoma] = useSetting('player.isShowLyricRoma', false)
	return (
		<>
			<SettingRow label={tr('音质', 'Audio Quality')}><SettingSelect value={quality} onChange={setQuality} options={[
				{ value: '128k', label: '128k' }, { value: '320k', label: '320k' }, { value: 'flac', label: 'flac' },
			]} /></SettingRow>
			<SettingRow label={tr('音量', 'Volume')}><SettingSlider value={Number(volume)} min={0} max={1} step={0.01} onChange={setVolume} format={v => `${Math.round(v * 100)}%`} /></SettingRow>
			<SettingRow label={tr('播放倍速', 'Playback Speed')}><SettingSlider value={Number(rate)} min={0.5} max={2} step={0.1} onChange={setRate} format={v => `${v.toFixed(1)}x`} /></SettingRow>
			<SettingRow label={tr('保存播放进度', 'Save Playback Position')}><SettingSwitch value={saveTime} onChange={setSaveTime} /></SettingRow>
			<SettingRow label={tr('自动跳过错误曲目', 'Auto-skip Failed Tracks')}><SettingSwitch value={autoSkip} onChange={setAutoSkip} /></SettingRow>
			<SettingRow label={tr('播放结束停止', 'Stop When Finished')}><SettingSwitch value={stopEnd} onChange={setStopEnd} /></SettingRow>
			<SettingRow label={tr('显示歌词翻译', 'Show Lyric Translation')}><SettingSwitch value={showTrans} onChange={setShowTrans} /></SettingRow>
			<SettingRow label={tr('显示歌词音译', 'Show Lyric Romanization')}><SettingSwitch value={showRoma} onChange={setShowRoma} /></SettingRow>
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
			<SettingRow label={tr('显示操作按钮', 'Show Action Buttons')}><SettingSwitch value={actionBtns} onChange={setActionBtns} /></SettingRow>
			<SettingRow label={tr('点击整行播放', 'Tap Row to Play')}><SettingSwitch value={clickPlay} onChange={setClickPlay} /></SettingRow>
			<SettingRow label={tr('显示来源', 'Show Source')}><SettingSwitch value={showSource} onChange={setShowSource} /></SettingRow>
			<SettingRow label={tr('记住滚动位置', 'Remember Scroll Position')}><SettingSwitch value={saveScroll} onChange={setSaveScroll} /></SettingRow>
			<SettingRow label={tr('添加音乐位置', 'Add Music Position')}><SettingSelect value={addPos} onChange={setAddPos} options={[
				{ value: 'top', label: tr('顶部', 'Top') }, { value: 'bottom', label: tr('底部', 'Bottom') },
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
			<SettingRow label={tr('启用代理', 'Enable Proxy')} hint={tr('仅保存，不生效', 'saved only, no effect')}>
				<SettingSwitch value={proxyEnable} onChange={setProxyEnable} />
			</SettingRow>
			<SettingRow label={tr('代理地址', 'Proxy Host')} hint={tr('仅保存，不生效', 'saved only, no effect')}>
				<SettingSelect
					value={String(proxyHost || 'none')}
					onChange={(v) => setProxyHost(v === 'none' ? '' : v)}
					options={[{ value: 'none', label: tr('未设置', 'Not set') }, { value: '127.0.0.1', label: '127.0.0.1' }]}
				/>
			</SettingRow>
			<SettingRow label={tr('代理端口', 'Proxy Port')} hint={tr('仅保存，不生效', 'saved only, no effect')}>
				<Text style={{ color: c.textMuted, fontSize: macFont.body }}>{String(proxyPort)}</Text>
			</SettingRow>
			<SettingRow label={tr('并发下载数', 'Concurrent Downloads')} hint={tr('影响下载/预取队列上限', 'Caps download/prefetch queue')}>
				<SettingSelect
					value={String(maxDl)}
					onChange={(v) => setMaxDl(Number(v))}
					options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]}
				/>
			</SettingRow>
			<SettingRow label={tr('请求超时', 'Request Timeout')} hint={tr('影响音源解析与下载', 'Affects source resolving and downloads')}>
				<SettingSelect
					value={String(timeoutMs)}
					onChange={(v) => setTimeoutMs(Number(v))}
					options={[{ value: '10000', label: tr('10 秒', '10 s') }, { value: '15000', label: tr('15 秒', '15 s') }, { value: '30000', label: tr('30 秒', '30 s') }]}
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
			setStatus(tr('已清空缓存与设置，请手动重启 App 生效', 'Cache and settings cleared. Restart the app to apply.'))
		} catch (err: any) {
			setStatus(`${tr('清空失败', 'Failed')}: ${err?.message ?? err}`)
		}
		setConfirm(false)
	}

	return (
		<>
			<SettingRow label={tr('App Version', 'App Version')}><Text style={{ color: c.textMuted, fontSize: macFont.body }}>{version} ({build})</Text></SettingRow>
			<SettingRow label={tr('播放引擎', 'Playback Engine')}><Text style={{ color: c.textMuted, fontSize: macFont.body }}>RNTP + JSC</Text></SettingRow>
			<SettingRow label={tr('查看日志', 'View Logs')}>
				<Pressable onPress={() => router.push('/logScreen' as any)}>
					<Text style={{ color: c.primary, fontSize: macFont.body }}>{tr('打开', 'Open')} ›</Text>
				</Pressable>
			</SettingRow>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 16 }}>
				<Pressable onPress={() => setConfirm(true)} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
					<Text style={{ color: c.danger, fontSize: macFont.body }}>{tr('清空所有数据', 'Erase All Data')}</Text>
				</Pressable>
				{status ? <Text style={{ color: c.primary, fontSize: macFont.caption, marginTop: 8 }}>{status}</Text> : null}

			</View>
			{confirm ? (
				<View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
					<View style={{ backgroundColor: c.bg, borderRadius: 12, padding: 20, width: '100%' }}>
						<Text style={{ color: c.textStrong, fontSize: macFont.body, marginBottom: 8 }}>{tr('确认清空所有数据？', 'Erase all data?')}</Text>
						<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginBottom: 16 }}>{tr('将删除缓存与全部设置，不可撤销。', 'Caches and all settings will be deleted. This cannot be undone.')}</Text>
						<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
							<Pressable onPress={() => setConfirm(false)}><Text style={{ color: c.textMuted, fontSize: macFont.body }}>{tr('取消', 'Cancel')}</Text></Pressable>
							<Pressable onPress={wipeAll}><Text style={{ color: c.danger, fontSize: macFont.body }}>{tr('确认清空', 'Erase')}</Text></Pressable>
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
			<SettingRow label={tr('显示热门搜索', 'Show Trending Searches')}><SettingSwitch value={hot} onChange={setHot} /></SettingRow>
			<SettingRow label={tr('显示历史搜索', 'Show Search History')}><SettingSwitch value={history} onChange={setHistory} /></SettingRow>
			<SettingRow label={tr('进入时聚焦搜索框', 'Focus Search on Enter')}><SettingSwitch value={focus} onChange={setFocus} /></SettingRow>
		</>
	)
}

const OdcSection = () => {
	const [clearInput, setClearInput] = useSetting('odc.isAutoClearSearchInput', false)
	const [clearList, setClearList] = useSetting('odc.isAutoClearSearchList', false)
	return (
		<>
			<SettingRow label={tr('离开搜索页清空输入', 'Clear Input on Leave')} hint={tr('回到搜索页时输入框为空', 'Input is empty when you come back')}>
				<SettingSwitch value={clearInput} onChange={setClearInput} />
			</SettingRow>
			<SettingRow label={tr('离开搜索页清空结果', 'Clear Results on Leave')} hint={tr('回到搜索页时结果列表为空', 'Results are empty when you come back')}>
				<SettingSwitch value={clearList} onChange={setClearList} />
			</SettingRow>
		</>
	)
}

const PlayDetailSection = () => {
	const [blur, setBlur] = useSetting('playDetail.bgBlur', 0.6)
	const [zoom, setZoom] = useSetting('playDetail.isZoomActiveLrc', true)
	const [fontSizeKey, setFontSizeKey] = useSetting('lyric.detailFontSize', 1)
	const [delay, setDelay] = useSetting('playDetail.isDelayScroll', false)
	return (
		<>
			<SettingRow label={tr('背景模糊', 'Background Blur')} hint={tr('0 = 无模糊，1 = 最强', '0 = none, 1 = strongest')}>
				<SettingSlider value={Number(blur)} min={0} max={1} step={0.05} onChange={setBlur} format={v => `${Math.round(v * 100)}%`} />
			</SettingRow>
			<SettingRow label={tr('歌词字号', 'Lyric Font Size')} hint={tr('影响紧凑歌词与全屏歌词', 'Affects compact and full-screen lyrics')}>
				<SettingSelect
					value={String(fontSizeKey)}
					onChange={(v) => setFontSizeKey(Number(v))}
					options={[{ value: '0', label: tr('小', 'Small') }, { value: '1', label: tr('标准', 'Standard') }, { value: '2', label: tr('大', 'Large') }, { value: '3', label: tr('特大', 'X-Large') }]}
				/>
			</SettingRow>
			<SettingRow label={tr('歌词当前行放大', 'Enlarge Current Lyric Line')}><SettingSwitch value={zoom} onChange={setZoom} /></SettingRow>
			<SettingRow label={tr('歌词滚动延迟', 'Lyric Scroll Delay')}><SettingSwitch value={delay} onChange={setDelay} /></SettingRow>
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
			const idx = await cm.readCacheIndex()
			// 缓存管理只统计「播放产生的缓存」（manual !== true），手动下载单独保留
			const autoNames = names.filter((n: string) => !n.endsWith('.part') && (idx as any)[n]?.manual !== true)
			setCount(autoNames.length)
		} catch { setCount(0) }
	}, [])

	const clearAuto = async() => {
		try {
			const cm = await import('@/player/CacheManager')
			const FS = await import('expo-file-system/legacy')
			const idx: any = await cm.readCacheIndex()
			const names: string[] = await FS.readDirectoryAsync(cm.cacheDir)
			let removed = 0
			for (const n of names) {
				if (n.endsWith('.part')) continue
				if (idx[n]?.manual === true) continue
				try { await FS.deleteAsync(`${cm.cacheDir}${n}`, { idempotent: true }); await cm.removeCacheIndexEntry(n); removed++ } catch { /* ignore */ }
			}
			await refresh()
			setStatus(`${tr('已清理缓存', 'Cleared')} ${removed} ${tr('个（保留手动下载）', 'items (downloads kept)')}`)
			logInfo('[cache] cleared auto count=', removed)
		} catch (err: any) {
			setStatus(`${tr('清理失败', 'Clear failed')}: ${err?.message ?? err}`)
		}
	}

	React.useEffect(() => { void refresh() }, [refresh])

	const clearAll = async() => {
		try {
			const cm = await import('@/player/CacheManager')
			await cm.clearCache()
			await refresh()
			setStatus(tr('已清理缓存', 'Cache cleared'))
		} catch (err: any) {
			setStatus(`${tr('清理失败', 'Clear failed')}: ${err?.message ?? err}`)
		}
	}

	const mb = (size / 1024 / 1024).toFixed(1)

	return (
		<>
			<SettingRow label={tr('缓存占用', 'Cache Usage')} hint={`${count} ${tr('个文件', 'files')}`}>
				<Text style={{ color: c.textMuted, fontSize: macFont.body }}>{mb} MB</Text>
			</SettingRow>
			<SettingRow label={tr('缓存上限', 'Cache Limit')} hint={tr('超出后按最久未使用淘汰', 'Evicts least recently used first')}>
				<SettingSelect
					value={String(limitMb)}
					onChange={(v) => setLimitMb(Number(v))}
					options={[
						{ value: '200', label: '200 MB' }, { value: '500', label: '500 MB' },
						{ value: '1024', label: '1 GB' }, { value: '2048', label: '2 GB' },
					]}
				/>
			</SettingRow>
			<SettingRow label={tr('dev 标志', 'dev flags')} hint={`forceBadUrl=${String(useSetting('_dev.forceBadUrl', false)[0])} slowBufferMs=${String(useSetting('_dev.slowBufferMs', 0)[0])}`}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>—</Text>
			</SettingRow>
			<View style={{ paddingHorizontal: macSpace.pageX, paddingTop: 12 }}>
				<Pressable onPress={clearAuto} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
					<Text style={{ color: c.text, fontSize: macFont.body }}>{tr('清理缓存（保留下载）', 'Clear cache (keep downloads)')}</Text>
				</Pressable>
				<Pressable onPress={clearAll} style={({ pressed }) => ({ marginTop: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}>
					<Text style={{ color: c.danger, fontSize: macFont.body }}>{tr('全部清理（含手动下载）', 'Clear all (incl. manual downloads)')}</Text>
				</Pressable>
				{status ? <Text style={{ color: c.primary, fontSize: macFont.caption, marginTop: 8 }}>{status}</Text> : null}
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
			setStatus(`${tr('已导出', 'Exported')} ${Object.keys(obj.data).length} ${tr('项', 'items')} → ${uri}`)
		} catch (err: any) {
			setStatus(`${tr('导出失败', 'Export failed')}: ${err?.message ?? err}`)
		}
	}

	const doExportAll = async() => {
		try {
			const { exportAllData, writeBackupFile } = await import('@/jk/backup')
			const obj = await exportAllData()
			const uri = await writeBackupFile('lx_datas_v2', obj)
			setLastPath(uri)
			setStatus(`${tr('已导出全部数据', 'All data exported')} → ${uri}`)
		} catch (err: any) {
			setStatus(`${tr('导出失败', 'Export failed')}: ${err?.message ?? err}`)
		}
	}

	const doExportPlayList = async() => {
		try {
			const { exportPlayList, writeBackupFile } = await import('@/jk/backup')
			const obj = await exportPlayList()
			const uri = await writeBackupFile('lx_list_v2', obj)
			setLastPath(uri)
			setStatus(`${tr('已导出', 'Exported')} ${obj.data.length} ${tr('个歌单', 'playlists')} → ${uri}`)
		} catch (err: any) {
			setStatus(`${tr('导出失败', 'Export failed')}: ${err?.message ?? err}`)
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
				setStatus(`${tr('导入歌单', 'Playlists imported')}: +${r.lists} / ${tr('合并', 'merged')} ${r.merged} / ${tr('新增歌曲', 'songs')} ${r.songs}`)
			} else if (kind === 'setting') {
				if (obj.type !== 'setting_v2') throw new Error(`类型不匹配：${obj.type}`)
				const r = importSetting(obj.data)
				setStatus(`${tr('导入设置', 'Settings imported')}: ${r.applied} ${tr('项', 'items')}, ${tr('跳过', 'skipped')} ${r.skipped}`)
			} else {
				const r = importAllData(obj)
				const pl: any = (r as any).playListResult ?? { lists: 0, merged: 0, songs: 0 }
				if (!r.playListCount) {
					setStatus(`${tr('备份中没有歌单。设置', 'No playlists in backup. Settings')} ${r.setting.applied} (${tr('跳过', 'skipped')} ${r.setting.skipped})`)
				} else {
					setStatus(`设置 ${r.setting.applied} 项（跳过 ${r.setting.skipped}），歌单 ${r.playListCount} 个（新增 ${pl.lists} / 合并 ${pl.merged}），歌曲 ${pl.songs} 首`)
					setShowGoFavorites(true)
				}
			}
			const m = await import('@/jk/settingsStore')
			setTotal(Object.keys(m.getAllSettings()).length)
		} catch (err: any) {
			setStatus(`${tr('导入失败', 'Import failed')}: ${err?.message ?? err}`)
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
			{btn(tr('导出设置', 'Export Settings'), doExportSetting)}
			{btn(tr('导入设置', 'Import Settings'), () => pickAndImport('setting'))}
			{btn(tr('导出全部数据', 'Export All Data'), doExportAll)}
			{btn(tr('导入全部数据', 'Import All Data'), () => pickAndImport('all'))}
			{btn(tr('导出歌单', 'Export Playlists'), doExportPlayList)}
			{btn(tr('导入歌单', 'Import Playlists'), () => pickAndImport('playlist'))}
			<View style={{ marginTop: 16, gap: 4 }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>{tr('当前设置项总数：', 'Total settings: ')}{total}</Text>
				<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>{tr('上次导出：', 'Last export: ')}{lastPath || '—'}</Text>
				{status ? <Text style={{ color: c.primary, fontSize: macFont.caption, marginTop: 8 }}>{status}</Text> : null}
				{showGoFavorites ? (
					<Pressable
						onPress={() => router.push('/(tabs)/favorites' as any)}
						style={({ pressed }) => ({ marginTop: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: pressed ? c.fillMuted : c.fillSubtle })}
					>
						<Text style={{ color: c.text, fontSize: macFont.body }}>{tr('查看我的列表', 'View My Lists')}</Text>
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
				} else if (action === 'seek') {
					const pos = Number((params as any).pos ?? 0)
					if (!Number.isFinite(pos) || pos <= 0) throw new Error('bad pos')
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					await (tp as any).seekTo(pos)
					// seek 后等一小会儿再暂停，确保 position 已写入（立即暂停可能读到旧值）
					await new Promise(r => setTimeout(r, 300))
					if (String((params as any).pause ?? '1') === '1') await (tp as any).pause()
					const prog: any = (tp as any).getProgress?.() ?? {}
					logInfo('[dev] seek ok pos=', pos, 'paused=', String((params as any).pause ?? '1'), 'now=', Number(prog?.position ?? 0).toFixed(2))
				} else if (action === 'searchPlay') {
					// 搜索一首歌并直接播放（验证「搜到 → 点播 → 出声」全链路）
					const src = String((params as any).source ?? 'kg') as any
					const q = String((params as any).q ?? '')
					const index = Math.max(0, Number((params as any).index ?? 0) || 0)
					if (!q) throw new Error('缺少 q')
					const { searchBySource } = await import('@/jk/musicSdk')
					const { jkToTrack } = await import('@/jk/adapt')
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					const list = await searchBySource(src, q, 1, 10)
					const hit: any = list[index]
					if (!hit) throw new Error('搜索结果为空')
					const track: any = jkToTrack(hit)
					await (tp as any).play(track)
					logInfo('[dev] searchPlay', src, String(hit.name ?? ''), 'id=', track.id)
				} else if (action === 'probe') {
					// 直接验证「取流链路」而不命中本地缓存：先看脚本池原始结果，再看跨源兜底后的结果
					const source = String((params as any).source ?? 'kw') as any
					const id = String((params as any).id ?? '')
					const name = String((params as any).name ?? '测试')
					const singer = String((params as any).singer ?? '')
					if (!id) throw new Error('缺少 id')
					const { getPooledMusicUrl } = await import('@/jk/sourceRegistry')
					const { resolveSource } = await import('@/player/MusicSourceResolver')
					const { jkToTrack } = await import('@/jk/adapt')
					let pooled = ''
					try {
						const url = await getPooledMusicUrl(name, singer, id, '320k', source, {
							songmid: id, id, name, singer, source, hash: id,
						})
						pooled = url ? `ok(${url.slice(0, 50)})` : 'empty'
					} catch (err) {
						pooled = `fail(${String((err as any)?.message ?? err).slice(0, 60)})`
					}
					const track: any = jkToTrack({
						id, name, singer, source, interval: null,
						meta: { songmid: id, hash: id, source },
					} as any)
					let finalUrl = ''
					try {
						const r: any = await resolveSource(track, { requestType: 'current' } as any)
						finalUrl = String(r?.url ?? '')
					} catch (err) {
						finalUrl = `throw:${String((err as any)?.message ?? err).slice(0, 60)}`
					}
					const verdict = !finalUrl ? 'empty' : finalUrl.includes('fake') ? 'fake' : 'ok'
					logInfo(`[probe] ${source} pooled=${pooled} final=${verdict} name=${name}`)
				} else if (action === 'playSearch') {
					// 搜索某源并播放指定曲目（用于验证换源兜底，无需点击）
					const src = String((params as any).source ?? 'kg')
					const q = String((params as any).q ?? String((params as any).title ?? '牡丹亭'))
					const wantId = String((params as any).id ?? '')
					const { searchBySource } = await import('@/jk/musicSdk')
					const { jkToTrack } = await import('@/jk/adapt')
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					const list: any[] = await searchBySource(src as any, q, 1, 10)
					if (!list.length) throw new Error('搜索结果为空')
					const hit: any = wantId
						? (list.find((x: any) => String(x.id) === wantId) ?? list[0])
						: list[0]
					if (String((params as any).force ?? '') === '1') {
						try { await (tp as any).stop?.() } catch { /* ignore */ }
						logInfo('[dev] playSearch force=1 source=', src, 'id=', String(hit?.id ?? ''))
					}
					const track: any = jkToTrack(hit)
					logInfo('[dev] playSearch', src, 'title=', String(track?.title ?? ''), 'id=', String(track?.id ?? ''), 'singer=', String(track?.artist ?? ''))
					await tp.playWithReplacePlayList(track, [track])
				} else if (action === 'indexAll') {
					// 把五源搜索结果全部写进「同曲多源索引」，供换源兜底直接查表
					const q = String((params as any).q ?? '牡丹亭')
					const { searchAllSources } = await import('@/jk/musicSdk')
					const idx = await import('@/jk/crossSourceIndex')
					let lists: any[] = []
					try {
						lists = await searchAllSources(q, 1, 5)
					} catch (err) {
						logInfo('[dev] indexAll search failed', String((err as any)?.message ?? err).slice(0, 80))
					}
					const items = lists.reduce((n: number, g: any) => n + (g?.list?.length ?? 0), 0)
					idx.remember(lists.flatMap((g: any) => g?.list ?? []))
					logInfo('[dev] indexAll q=', q, 'sources=', lists.length, 'items=', items, 'stats=', JSON.stringify(idx.stats()))
				} else if (action === 'evict') {
					const src = String((params as any).source ?? 'kg')
					const sid = String((params as any).id ?? '')
					const cm = await import('@/player/CacheManager')
					const mod: any = await import('expo-file-system/legacy')
					const FS: any = mod?.default ?? mod
					const dir = `${FS.documentDirectory}musicCache/`
					let fileState = 'none'
					let base = ''
					try {
						const index: any = await cm.readCacheIndex()
						base = Object.keys(index ?? {}).find(k => k.startsWith(`${src}_${sid}`)) ?? ''
					} catch { /* ignore */ }
					// 不依赖 getLocalFilePath（它要求完整 musicItem，缺 title/artist 会抛错）
					const candidates = [
						...(base ? [`${base}.flac`, `${base}.mp3`, `${base}.m4a`] : []),
						`${src}_${sid}.flac`,
						`${src}_${sid}.mp3`,
						`${src}_${sid}.m4a`,
					]
					for (const name of candidates) {
						try {
							const info: any = await FS.getInfoAsync(`${dir}${name}`)
							if (info?.exists) {
								await FS.deleteAsync(`${dir}${name}`, { idempotent: true })
								fileState = 'deleted'
							}
						} catch { /* ignore */ }
					}
					if (base) {
						try { await cm.removeCacheIndexEntry(base) } catch { /* ignore */ }
					}
					const { clearAltCache, clearPreloadCache } = await import('@/player/MusicSourceResolver')
					clearAltCache()
					clearPreloadCache()
					logInfo('[dev] evict source=', src, 'id=', sid, 'base=', base || '-', 'file=', fileState, 'alt=cleared preload=cleared')
				} else if (action === 'clearxsource') {
					const idx = await import('@/jk/crossSourceIndex')
					idx.clear()
					const { clearAltCache } = await import('@/player/MusicSourceResolver')
					clearAltCache()
					logInfo('[dev] clearxsource: index + altCache cleared')
					logInfo('[dev] clearxsource ok')
				} else if (action === 'smoke') {
					const q = String((params as any).q ?? '周杰伦')
					const { searchBySource, resolveMusicSource } = await import('@/jk/musicSdk').then(async(m) => {
						const { resolveSource } = await import('@/player/MusicSourceResolver')
						return { searchBySource: m.searchBySource, resolveMusicSource: resolveSource }
					})
					const { default: FS } = await import('expo-file-system/legacy')
					const lines: string[] = []
					for (const src of ['kw', 'kg', 'tx', 'wy', 'mg']) {
						let n = 0
						let verdict = 'empty'
						let quality = '-'
						try {
							const list: any[] = await searchBySource(src as any, q, 1, 5)
							n = list.length
							if (list[0]) {
								const { jkToTrack } = await import('@/jk/adapt')
								const track: any = jkToTrack(list[0] as any)
								const r: any = await resolveMusicSource(track, { requestType: 'prefetch', requestKey: `smoke_${src}_${Date.now()}` } as any)
								const url = String(r?.url ?? '')
								verdict = !url ? 'empty' : url.includes('fake-audio') ? 'fake' : 'ok'
								quality = String((globalThis as any).__jkActualQuality ?? '-')
							}
						} catch (err) {
							verdict = 'error:' + String((err as any)?.message ?? err).slice(0, 30)
						}
						lines.push(`[smoke] ${src} results=${n} url=${verdict} q=${quality}`)
						logInfo(`[smoke] ${src} results=${n} url=${verdict} q=${quality}`)
					}
					try {
						const path = `${FS.documentDirectory}dev-smoke.log`
						await FS.writeAsStringAsync(path, lines.join('\n') + '\n', { encoding: 'utf8' as any })
						logInfo('[smoke] written', path)
					} catch { /* ignore */ }
					logInfo('[dev] smoke done', 'q=' + q)
				} else if (action === 'downloadAll') {
					const { downloadTrack } = await import('@/jk/downloader')
					const src = String((params as any).source ?? 'kw')
					const ids = String((params as any).ids ?? '').split(',').map(x => x.trim()).filter(Boolean)
					const bad = String((params as any).bad ?? '0') === '1'
					for (const id of ids) {
						const track: any = {
							id, title: id, artist: '', platform: src, album: '',
							__forceBad: bad,
						}
						void downloadTrack(track)
					}
					logInfo('[dev] downloadAll', ids.length, 'bad=', bad)
				} else if (action === 'download') {
					const { downloadTrack } = await import('@/jk/downloader')
					const track: any = {
						id: String((params as any).id ?? ''),
						title: String((params as any).name ?? '测试下载'),
						artist: String((params as any).singer ?? ''),
						platform: String((params as any).source ?? 'kw'),
						album: '',
					}
					if (!track.id) throw new Error('缺少 id')
					const q = String((params as any).quality ?? '')
					await downloadTrack(track, q ? { quality: q } : undefined)
					logInfo('[dev] download ok', track.title, 'q=', q || '(default)')
				} else if (action === 'addToList') {
					const listId = String((params as any).listId ?? '')
					const songId = String((params as any).id ?? '')
					const src = String((params as any).source ?? 'kw')
					if (!listId || !songId) throw new Error('缺少 listId 或 id')
					const lib = await import('@/jk/libraryStore')
					const jk: any = {
						id: songId,
						name: String((params as any).name ?? '测试歌曲'),
						singer: String((params as any).singer ?? ''),
						source: src,
						interval: null,
						meta: { songmid: songId, source: src, albumName: '' },
					}
					lib.addToList(listId, [jk], 'bottom')
					logInfo('[dev] addToList ok', listId, 'count=', lib.getListById(listId).length)
				} else if (action === 'theme') {
					const id = String((params as any).id ?? 'jk')
					const { setMacTheme } = await import('@/jk/themeStore')
					setMacTheme(id as any)
					logInfo('[dev] theme', id)
				} else if (action === 'accent') {
					const { setAccentColor } = await import('@/jk/themeStore')
					setAccentColor(String((params as any).color ?? ''))
					logInfo('[dev] accent', String((params as any).color ?? '(follow theme)'))
				} else if (action === 'wallpaper') {
					const { setWallpaper } = await import('@/jk/themeStore')
					const next: any = {}
					if ((params as any).uri !== undefined) next.uri = String((params as any).uri)
					if ((params as any).blur !== undefined) next.blur = Number((params as any).blur)
					if ((params as any).opacity !== undefined) next.opacity = Number((params as any).opacity)
					setWallpaper(next)
					logInfo('[dev] wallpaper', JSON.stringify(next))
				} else if (action === 'themeMode') {
					const mode = String((params as any).mode ?? 'system')
					const { themeModeStore } = await import('@/hooks/useAppTheme')
					themeModeStore.setValue(mode as any)
					try {
						const PersistStatus = (await import('@/store/PersistStatus')).default
						PersistStatus.set('app.themeMode' as any, mode)
					} catch { /* ignore */ }
					logInfo('[dev] themeMode', mode)
				} else if (action === 'lang') {
					const code = String((params as any).code ?? 'en')
					const { changeLanguage } = await import('@/utils/i18n')
					changeLanguage(code)
					logInfo('[dev] lang', code)
				} else if (action === 'fullLyric') {
					const on = String((params as any).on ?? '1') === '1'
					;(globalThis as any).__JK_FULL_LYRIC__ = on
					logInfo('[dev] fullLyric on=', on)
				} else if (action === 'removeList') {
					// 验证歌单删除的数据层（UI 长按入口另测）
					const listId = String((params as any).id ?? '')
					if (!listId) throw new Error('缺少 id')
					const lib = await import('@/jk/libraryStore')
					const before = lib.getUserLists().length
					lib.removeUserList(listId)
					const after = lib.getUserLists().length
					logInfo('[dev] removeList id=', listId, 'before=', before, 'after=', after)
				} else if (action === 'importSource') {
					const url = String((params as any).url ?? '')
					if (!url) throw new Error('缺少 url')
					const { createMusicApiFromScript, fetchScriptFromUrl } = await import('@/helpers/userApi/importMusicSource')
					const { musicApiStore: store } = await import('@/player/PlayerStore')
					const { default: PersistStatus } = await import('@/store/PersistStatus')
					const code = await fetchScriptFromUrl(url)
					const api: any = await createMusicApiFromScript(code)
					const list: any[] = (store.getValue() as any[]) ?? []
					const next = [...list.filter((x: any) => String(x?.name) !== String(api?.name)), api]
					store.setValue(next as any)
					PersistStatus.set('music.musicApi', next.map((x: any) => {
						const { getMusicUrl, ...rest } = x ?? {}
						return rest
					}) as any)
					const tp: any = (await import('@/helpers/trackPlayerIndex')).default
					await tp.setMusicApiAsSelectedById(String(api?.id ?? ''))
					logInfo(`[dev] importSource ok name=${String(api?.name ?? '')} sources=${(api?.supportedSources ?? []).join('/')}`)
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
					// music.quality 是播放链路的真源，必须同步进 qualityStore，否则只写 PersistStatus 不生效
					if (k === 'music.quality') {
						try {
							const tp: any = (await import('@/helpers/trackPlayerIndex')).default
							tp.setQuality?.(String(parsed))
						} catch { /* ignore */ }
					}
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
	const title = getSectionTitle(section)
	const note = getSectionNote(section)

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
					<Text style={{ color: c.primary, fontSize: macFont.body }}>‹ {tr('返回', 'Back')}</Text>
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
						{tr('该分区将在后续版本提供', 'This section is coming in a later version')}
					</Text>
				)}
			</ScrollView>
		</View>
	)
}

export default SettingsSectionScreen
