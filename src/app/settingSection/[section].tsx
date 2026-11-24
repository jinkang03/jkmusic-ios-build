import { nowLanguage, changeLanguage } from '@/utils/i18n'
import { ACCENT_PRESETS, accentStore, wallpaperStore, wallpaperAccentStore, setAccentColor, setWallpaper, getWallpaperUri } from '@/jk/themeStore'
import { setGlassAlpha } from '@/constants/glass'
import ColorPickerModal from '@/components/ColorPickerModal'
import { setTextColor, textColorStore } from '@/jk/themeStore'
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
import SoundEffectPanel from '@/components/settings/SoundEffectPanel'
import SettingSwitch from '@/components/settings/SettingSwitch'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { useAppTheme, useThemeMode } from '@/hooks/useAppTheme'
import { setSetting, useSetting } from '@/jk/settingsStore'
import BUILD_INFO from '@/constants/buildInfo'
import PersistStatus from '@/store/PersistStatus'
import { fileUriFromPath } from '@/helpers/localFile'
import { showToast } from '@/utils/utils'
import { logError, logInfo } from '@/helpers/logger'
import { getSectionTitle, getSectionNote } from '@/jk/settingsSections'
import { tr } from '@/utils/i18n'

const BasicSection = () => {
	// 语言写 app.language；强调色是唯一颜色来源（空 = 跟随壁纸主色）
	const lang = nowLanguage.useValue()
	const accent = accentStore.useValue()
	const wallpaper = wallpaperStore.useValue()
	const wallpaperAccent = wallpaperAccentStore.useValue()
	const [pickerVisible, setPickerVisible] = React.useState(false)
	const textColor = textColorStore.useValue()
	const [textPickerVisible, setTextPickerVisible] = React.useState(false)
	const routeParams = useLocalSearchParams<{ openPicker?: string }>()
	React.useEffect(() => {
		if (routeParams?.openPicker === '1') setPickerVisible(true)
	}, [routeParams?.openPicker])
	const { themeMode, setThemeMode } = useThemeMode()
	const { isDark, glassAlpha } = useAppTheme()
	const c = macPalette(!!isDark)
	// 源名语义与桌面版一致：alias = 中文名（酷我音乐），real = 平台代号（kw）
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
			const { saveWallpaperFrom } = await import('@/jk/themeStore')
			await saveWallpaperFrom(res.assets[0].uri)
			showToast(tr('已设置', 'Done'), tr('壁纸已应用到功能页面', 'Wallpaper applied to main pages'), 'success')
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

			{/* 强调色：唯一颜色来源；留空 = 跟随壁纸主色 */}
			<SettingRow
				label={tr('强调色', 'Accent Color')}
				hint={accent
					? tr('自定义', 'Custom')
					: (wallpaperAccent
						? tr('跟随壁纸', 'Follows wallpaper')
						: tr('默认', 'Default'))}
			>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
					<Pressable
						onPress={() => setPickerVisible(true)}
						style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
					>
						<Text style={{ color: c.primary, fontSize: macFont.caption }}>{tr('自定义', 'Custom')}</Text>
						<Ionicons name="color-palette-outline" size={16} color={c.primary} />
					</Pressable>
					<View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: accent || wallpaperAccent || c.primary, borderWidth: 0.5, borderColor: c.divider }} />
				</View>
			</SettingRow>
			<View style={{
				paddingHorizontal: macSpace.pageX, paddingVertical: 12,
				borderBottomWidth: 0,
			}}>
				{/* 快捷色板（点「自定义」可进色盘选任意颜色） */}
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
						{accent
							? tr('恢复跟随壁纸', 'Follow wallpaper')
							: (wallpaperAccent ? tr('当前跟随壁纸', 'Following wallpaper') : tr('当前为默认色', 'Using default'))}
					</Text>
				</Pressable>
			</View>
			<ColorPickerModal
				visible={pickerVisible}
				initialColor={accent || wallpaperAccent || c.primary}
				followWallpaper={!accent}
				onClose={() => setPickerVisible(false)}
				onPick={(color) => { setAccentColor(color); setPickerVisible(false) }}
				onFollowWallpaper={() => { setAccentColor(''); setPickerVisible(false) }}
			/>
			{/* 文字颜色：与强调色同一套色盘，对所有功能页面的文字生效 */}
			<SettingRow
				label={tr('文字颜色', 'Text Color')}
				hint={textColor ? tr('自定义', 'Custom') : tr('默认（跟随壁纸明暗）', 'Default')}
			>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
					<Pressable
						onPress={() => setTextPickerVisible(true)}
						style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
					>
						<Text style={{ color: c.primary, fontSize: macFont.caption }}>{tr('自定义', 'Custom')}</Text>
						<Ionicons name="color-palette-outline" size={16} color={c.primary} />
					</Pressable>
					<View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: textColor || c.text, borderWidth: 0.5, borderColor: c.divider }} />
				</View>
			</SettingRow>
			<ColorPickerModal
				visible={textPickerVisible}
				initialColor={textColor || '#FFFFFF'}
				onClose={() => setTextPickerVisible(false)}
				onPick={(color) => { setTextColor(color); setTextPickerVisible(false) }}
				onFollowWallpaper={() => { setTextColor(''); setTextPickerVisible(false) }}
			/>
			<SettingRow
				label={tr('主题壁纸', 'Wallpaper')}
				hint={wallpaper.uri
					? tr('已应用到功能页面（播放页仍显示封面）', 'Applied to main pages (player keeps artwork)')
					: tr('选择一张图片作为功能页面背景', 'Pick an image as the background of main pages')}
			>
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
					<SettingRow label={tr('壁纸磨砂', 'Wallpaper Blur')} hint={tr('0 = 清晰，40 = 最模糊', '0 = sharp, 40 = strongest')}>
						<SettingSlider value={wallpaper.blur} min={0} max={40} step={1} onChange={(v) => setWallpaper({ blur: v })} format={(v) => `${Math.round(v)}`} />
					</SettingRow>
					<SettingRow label={tr('玻璃不透明度', 'Glass Opacity')} hint={tr('越高页面底色越实，壁纸越淡', 'Higher = more solid pages, fainter wallpaper')}>
						<SettingSlider value={wallpaper.opacity} min={10} max={100} step={1} onChange={(v) => setWallpaper({ opacity: v })} format={(v) => `${Math.round(v)}%`} />
					</SettingRow>
				</>
			) : null}
			<SettingRow
				label={tr('玻璃透明度', 'Glass Opacity')}
				hint={tr('控制按钮/卡片的玻璃底透明度', 'Glass fill opacity for buttons and cards')}
			>
				<SettingSlider
					value={Math.round((Number(glassAlpha ?? 0.55)) * 100)}
					min={0}
					max={100}
					step={1}
					onChange={(v) => setGlassAlpha(Number(v) / 100)}
					format={(v) => `${Math.round(v)}%`}
				/>
			</SettingRow>
			<SettingRow label={tr('显示源名', 'Source Name')} hint={tr('歌曲列表里的音源角标', 'Source badge in song lists')}><SettingSelect value={sourceName === 'real' ? 'real' : 'alias'} onChange={(v) => setSourceName(v as any)} options={[
				{ value: 'alias', label: tr('中文名（酷我音乐）', 'Full name') }, { value: 'real', label: tr('平台代号（kw）', 'Code') },
			]} /></SettingRow>
		</>
	)
}

const PlayerSection = () => {
	// 以 music.quality 为唯一真源（播放链路读 qualityStore），不再写 player.playQuality 镜像
	const [quality, setQualityRaw] = useSetting('music.quality', '128k')
	const setQuality = React.useCallback(async(v: string) => {
		setQualityRaw(v)
		try {
			const { default: tp } = await import('@/helpers/trackPlayerIndex')
			;(tp as any).setQuality?.(v)
		} catch { /* ignore */ }
	}, [setQualityRaw])
	const [volume, setVolumeRaw] = useSetting('player.volume', 1)
	const [saveTime, setSaveTime] = useSetting('player.isSavePlayTime', true)
	const [autoSkip, setAutoSkip] = useSetting('player.autoSkipOnError', true)
	const [showTrans, setShowTrans] = useSetting('player.isShowLyricTranslation', false)
	// 音量/倍速：写设置的同时立即作用于当前播放器（否则要等下一次启动才生效）
	const setVolume = React.useCallback(async(v: number) => {
		setVolumeRaw(v)
		try {
			const { default: tp } = await import('@/helpers/trackPlayerIndex')
			;(tp as any).setVolume?.(v)
		} catch { /* ignore */ }
	}, [setVolumeRaw])
	return (
		<>
			<SettingRow label={tr('音质', 'Audio Quality')}><SettingSelect value={quality} onChange={setQuality} options={[
				{ value: '128k', label: '128k' }, { value: '320k', label: '320k' }, { value: 'flac', label: 'flac' },
			]} /></SettingRow>
			<SettingRow label={tr('音量', 'Volume')}><SettingSlider value={Number(volume)} min={0} max={1} step={0.01} onChange={setVolume} format={v => `${Math.round(v * 100)}%`} /></SettingRow>
			<SettingRow
				label={tr('保存播放进度', 'Save Playback Position')}
				hint={tr('启动后恢复上次播放的曲目与位置', 'Restore last track and position on launch')}
			>
				<SettingSwitch value={saveTime} onChange={setSaveTime} />
			</SettingRow>
			<SettingRow
				label={tr('自动跳过错误曲目', 'Auto-skip Failed Tracks')}
				hint={tr('默认关闭：失败会暂停并提示，点播放重试', 'Off by default: a failure pauses and waits for retry')}
			>
				<SettingSwitch value={autoSkip} onChange={setAutoSkip} />
			</SettingRow>
			<SettingRow label={tr('显示歌词翻译', 'Show Lyric Translation')}><SettingSwitch value={showTrans} onChange={setShowTrans} /></SettingRow>
		</>
	)
}

const ListSection = () => {
	const [showSource, setShowSource] = useSetting('list.isShowSource', true)
	const [addPos, setAddPos] = useSetting('list.addMusicLocationType', 'top')
	return (
		<>
			<SettingRow label={tr('显示来源', 'Show Source')} hint={tr('歌曲列表里的音源角标', 'Source badge in song lists')}><SettingSwitch value={showSource} onChange={setShowSource} /></SettingRow>
			<SettingRow label={tr('添加音乐位置', 'Add Music Position')} hint={tr('加入歌单时插入顶部还是底部', 'Insert at top or bottom when adding to a playlist')}><SettingSelect value={addPos} onChange={setAddPos} options={[
				{ value: 'top', label: tr('顶部', 'Top') }, { value: 'bottom', label: tr('底部', 'Bottom') },
			]} /></SettingRow>
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
	// 由 scripts/sync-version.sh 生成，与 Info.plist 的真实版本/构建号一致
	const version = BUILD_INFO.version
	const build = BUILD_INFO.build

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
			<SettingRow label={tr('播放诊断', 'Playback Diagnostics')} hint={tr('最近 50 次失败/换源记录', 'Last 50 failures & source switches')}>
				<Pressable onPress={() => router.push('/diagnostics' as any)}>
					<Text style={{ color: c.primary, fontSize: macFont.body }}>{tr('打开', 'Open')} ›</Text>
				</Pressable>
			</SettingRow>
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

const PlayDetailSection = () => {
	const [blur, setBlur] = useSetting('playDetail.bgBlur', 0.6)
	const [zoom, setZoom] = useSetting('playDetail.isZoomActiveLrc', true)
	// 与播放页 +/- 按钮共用 PersistStatus，避免两套存储各写一份
	const fontSizeKey = PersistStatus.useValue('lyric.detailFontSize', 1)
	const setFontSizeKey = React.useCallback((v: number) => {
		PersistStatus.set('lyric.detailFontSize', v)
	}, [])
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
	const [dlSize, setDlSize] = React.useState(0)
	const [dlCount, setDlCount] = React.useState(0)
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
		try {
			const { getDownloadSize } = await import('@/jk/downloadStore')
			const dl = await getDownloadSize()
			setDlSize(dl.bytes)
			setDlCount(dl.count)
		} catch { setDlSize(0); setDlCount(0) }
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
			// 手动下载目录一并清空
			const FS = await import('expo-file-system/legacy')
			const { DOWNLOAD_ROOT } = await import('@/jk/downloadStore')
			try { await FS.deleteAsync(DOWNLOAD_ROOT, { idempotent: true }) } catch { /* ignore */ }
			await refresh()
			setStatus(tr('已清理缓存与下载', 'Cache and downloads cleared'))
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
			<SettingRow
				label={tr('已下载占用', 'Downloads Usage')}
				hint={`${dlCount} ${tr('首', 'songs')}`}
			>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
					<Text style={{ color: c.textMuted, fontSize: macFont.body }}>{(dlSize / 1024 / 1024).toFixed(1)} MB</Text>
					<Pressable onPress={() => { void refresh() }}>
						<Text style={{ color: c.primary, fontSize: macFont.caption }}>{tr('刷新', 'Refresh')}</Text>
					</Pressable>
				</View>
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
					// 与进度条拖动走同一路径（含预览位置保护），保证脚本验证覆盖真实交互
					const { seekWithPreview } = await import('@/player/seekPreview')
					await seekWithPreview(pos)
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
					const listName = String((params as any).list ?? '')
					// 模拟「播放详情页」传进来的 track：带已解析的流地址
					const fakeUrl = String((params as any).url ?? '')
					if (fakeUrl) (track as any).url = fakeUrl
					await downloadTrack(track, {
						quality: q || undefined,
						listName: listName || undefined,
					})
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
				} else if (action === 'wallpaperFile') {
					// 模拟「相册选图」的保存链路（无点击环境验证换图是否真的生效）
					const src = String((params as any).path ?? '')
					if (!src) throw new Error('缺少 path')
					const { saveWallpaperFrom } = await import('@/jk/themeStore')
					const name = await saveWallpaperFrom(src)
					logInfo('[dev] wallpaperFile saved=', name)
				} else if (action === 'wallpaper') {
					const { setWallpaper: setWp } = await import('@/jk/themeStore')
					const next: any = {}
					if ((params as any).uri !== undefined) next.uri = String((params as any).uri)
					if ((params as any).blur !== undefined) next.blur = Number((params as any).blur)
					if ((params as any).opacity !== undefined) next.opacity = Number((params as any).opacity)
					setWp(next)
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
				} else if (action === 'createList') {
					// 验证「我的列表」排序/置顶/删除等入口的数据层（UI 长按入口另测）
					const name = String((params as any).name ?? `测试歌单 ${Date.now() % 10000}`)
					const lib = await import('@/jk/libraryStore')
					const created = lib.createUserList(name)
					logInfo('[dev] createList id=', created.id, 'name=', name, 'total=', lib.getUserLists().length)
				} else if (action === 'removeList') {
					// 验证歌单删除的数据层（UI 长按入口另测）
					const listId = String((params as any).id ?? '')
					if (!listId) throw new Error('缺少 id')
					const lib = await import('@/jk/libraryStore')
					const before = lib.getUserLists().length
					lib.removeUserList(listId)
					const after = lib.getUserLists().length
					logInfo('[dev] removeList id=', listId, 'before=', before, 'after=', after)
				} else if (action === 'delDownload') {
					// 验证下载页删除的数据层：删第一个（或 index 指定）已下载文件
					const idx = Number((params as any).index ?? 0)
					const store = await import('@/jk/downloadStore')
					const before = await store.scanDownloads()
					const target = before[idx]
					if (!target) throw new Error('没有可删除的下载')
					await store.removeDownload(target.uri)
					const after = await store.scanDownloads()
					logInfo('[dev] delDownload', target.name, 'before=', before.length, 'after=', after.length,
						'stillThere=', after.some(it => it.uri === target.uri))
				} else if (action === 'listOrder') {
					const lib = await import('@/jk/libraryStore')
					const ids = lib.getAllListIds()
					const ordered = lib.applyListOrder(ids.map(id => ({ id }))).map(x => x.id)
					logInfo('[dev] listOrder saved=', JSON.stringify(lib.getListOrder()), 'effective=', JSON.stringify(ordered))
				} else if (action === 'pinTop') {
					const lib = await import('@/jk/libraryStore')
					const id = String((params as any).id ?? '')
					if (!id) throw new Error('缺少 id')
					lib.moveListToTop(id)
					const ordered = lib.applyListOrder(lib.getAllListIds().map(x => ({ id: x }))).map(x => x.id)
					logInfo('[dev] pinTop id=', id, 'effective=', JSON.stringify(ordered))
				} else if (action === 'sortMove') {
					const lib = await import('@/jk/libraryStore')
					const id = String((params as any).id ?? '')
					const delta = Number((params as any).delta ?? -1)
					if (!id) throw new Error('缺少 id')
					lib.moveListBy(id, delta)
					const ordered = lib.applyListOrder(lib.getAllListIds().map(x => ({ id: x }))).map(x => x.id)
					logInfo('[dev] sortMove id=', id, 'delta=', delta, 'effective=', JSON.stringify(ordered))
				} else if (action === 'probePlayback') {
					const tp: any = (await import('@/helpers/trackPlayerIndex')).default
					const prog: any = tp.getProgress?.() ?? {}
					const cur: any = tp.getCurrentMusic?.() ?? null
					logInfo('[dev] probePlayback', JSON.stringify({
						pos: Number(prog?.position ?? 0).toFixed(2),
						dur: Number(prog?.duration ?? 0).toFixed(2),
						title: String(cur?.title ?? ''),
						platform: String(cur?.platform ?? ''),
					}))
				} else if (action === 'probeList') {
					// 各平台歌单详情探测：source + 链接/id → 看能否拉到
					const src = String((params as any).source ?? 'kw')
					let raw = String((params as any).id ?? '')
					if (!raw) {
						// 没传 id：从该平台的公开歌单列表取第一个真实歌单
						const sdk2 = await import('@/jk/musicSdk')
						const list: any = await sdk2.getSongLists(src as any, { page: 1 })
						const first = (list?.list ?? list ?? [])[0]
						raw = String(first?.id ?? first?.specialid ?? '')
						logInfo('[dev] probeList auto pick', String(first?.name ?? ''), '->', raw)
					}
					const lib = await import('@/jk/libraryStore')
					const sdk = await import('@/jk/musicSdk')
					const sid = await lib.resolveSourceListId(raw)
					logInfo('[dev] probeList resolve', raw, '->', sid)
					const all: any[] = []
					let err = ''
					for (let page = 1; page <= 3; page++) {
						try {
							const res: any = await sdk.getSongListDetail(src as any, sid, page)
							const chunk = res?.list ?? []
							all.push(...chunk)
							if (chunk.length < 100) break
						} catch (e) {
							err = String((e as any)?.message ?? e)
							break
						}
					}
					logInfo('[dev] probeList', src, sid, 'count=', all.length, 'err=', err)
				} else if (action === 'importLxmc') {
					const FS = await import('expo-file-system/legacy')
					const path = `${FS.documentDirectory}lx_list.lxmc`
					const { readBackupFile, importPlayList } = await import('@/jk/backup')
					const obj = await readBackupFile(path)
					if (obj.type !== 'playList_v2') throw new Error(`类型不匹配：${obj.type}`)
					const r = importPlayList(obj.data)
					const lib = await import('@/jk/libraryStore')
					const withSrc = lib.getUserLists().filter(l => l.sourceListId).length
					logInfo('[dev] importLxmc', JSON.stringify(r), 'lists=', lib.getUserLists().length, 'withSourceListId=', withSrc)
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
				} else if (action === 'applyChangeSource') {
					// 数据层验证换源：搜索目标平台 → 取第 N 条 → replaceSong → 打印替换条数
					const want = String((params as any).title ?? '')
					const targetPlatform = String((params as any).source ?? 'kw')
					const idx = Math.max(0, Number((params as any).index ?? 0) || 0)
					const lib = await import('@/jk/libraryStore')
					const all: any[] = [
						{ name: '试听列表', list: lib.getDefaultList() },
						{ name: '我的收藏', list: lib.getLoveList() },
						...lib.getUserLists().map((l: any) => ({ name: l.name, list: l.list })),
					]
					const hit = all.flatMap(l => l.list ?? []).find((m: any) => !want || String(m?.name ?? '').includes(want))
					if (!hit) throw new Error('找不到原曲目')
					const { searchBySource } = await import('@/jk/musicSdk')
					const list: any[] = await searchBySource(targetPlatform as any, `${String(hit.name ?? '')} ${String(hit.singer ?? '')}`.trim(), 1)
					const target = (list ?? [])[idx]
					if (!target) throw new Error('目标平台没有搜索结果')
					const count = lib.replaceSong(hit, target)
					logInfo('[dev] applyChangeSource', String(hit.name ?? ''), String(hit.source ?? ''), '->', String(target.source ?? ''), 'count=', count)
				} else if (action === 'dumpTheme') {
					const { macPalette } = await import('@/constants/macTokens')
					const { getThemeColors } = await import('@/constants/tokens')
					const { glassAlpha, wallpaperStore } = await import('@/jk/themeStore')
					logInfo('[dev] themeDump', JSON.stringify({
						wallpaper: wallpaperStore.getValue(),
						alpha: glassAlpha(),
						macBg: macPalette(false).bg,
						tokensBg: getThemeColors('light').background,
					}))
				} else if (action === 'testSource') {
					// 按平台逐个测试某个音源（无点击验证）
					const want = String((params as any).name ?? '')
					const { musicApiStore } = await import('@/player/PlayerStore')
					const list: any[] = (musicApiStore.getValue() as any[]) ?? []
					const api = list.find(a => String(a?.name ?? '').includes(want))
					if (!api) throw new Error(`找不到音源: ${want}`)
					const { testSourcePlatforms } = await import('@/jk/sourceTest')
					const { platforms, results } = await testSourcePlatforms(api)
					logInfo('[dev] testSource', String(api.name ?? ''), JSON.stringify({ platforms, results }))
				} else if (action === 'openChangeSource') {
					// 打开换源弹窗（按歌名在「我的列表」里找第一首匹配）
					const want = String((params as any).title ?? '')
					const listName = String((params as any).list ?? 'just do it')
					const lib = await import('@/jk/libraryStore')
					const all: any[] = [
						{ name: '试听列表', list: lib.getDefaultList() },
						{ name: '我的收藏', list: lib.getLoveList() },
						...lib.getUserLists().map((l: any) => ({ name: l.name, list: l.list })),
					]
					const targetList = all.find(l => l.name === listName) ?? all.find(l => l.name.includes(listName))
					const hit = (targetList?.list ?? []).find((m: any) => !want || String(m?.name ?? '').includes(want))
					if (!hit) throw new Error('列表里找不到该歌曲')
					const { setPendingChangeSource } = await import('@/jk/pendingChangeSource')
					setPendingChangeSource(hit)
					logInfo('[dev] openChangeSource title=', String(hit?.name ?? ''), 'source=', String(hit?.source ?? ''))
					router.push('/(modals)/changeSource' as any)
				} else if (action === 'playDownload') {
					// 播放「下载页」里的本地文件（验证封面/歌词 sidecar）
					const want = String((params as any).name ?? '')
					const ds = await import('@/jk/downloadStore')
					const items = await ds.scanDownloads()
					const hit = items.find(i => !want || i.name.includes(want))
					if (!hit) throw new Error('没有匹配的下载文件')
					const side = await ds.readSidecar(hit.uri)
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					const track: any = {
						id: `local:${side.meta?.sourceId || hit.name}`,
						platform: side.meta?.source || 'local',
						title: side.meta?.title || hit.name,
						artist: side.meta?.artist || '',
						album: side.meta?.album || '',
						duration: Number(side.meta?.duration ?? 0) || 0,
						// 必须编码：文件名含中文/空格/括号，裸路径会被 requireMediaUri 判为 INVALID_SOURCE
						url: fileUriFromPath(hit.uri),
					}
					logInfo('[dev] playDownload', track.title, 'cover=', side.coverUri ? 'yes' : 'no', 'lrc=', side.lyric ? 'yes' : 'no')
					await (tp as any).playWithReplacePlayList(track, [track])
				} else if (action === 'addToUserList') {
					// 验证「添加到歌单」的数据层：直接调 libraryStore.addToList
					const lib = await import('@/jk/libraryStore')
					const lists = lib.getUserLists()
					if (!lists.length) throw new Error('没有自建歌单')
					const wantName = String((params as any).name ?? '')
					const target = lists.find(l => l.name.includes(wantName)) ?? lists[0]
					const m: any = {
						id: `dev_${Date.now()}`,
						name: 'dev 测试曲',
						singer: 'dev',
						source: 'kw',
						meta: { songmid: '228908' },
					}
					lib.addToList(target.id, [m], 'top')
					logInfo('[dev] addToUserList ok name=', target.name, 'len=', lib.getListById(target.id).length)
				} else if (action === 'updateUserList') {
					const lib = await import('@/jk/libraryStore')
					const name = String((params as any).name ?? '')
					const target = lib.getUserLists().find(l => l.name.includes(name)) ?? lib.getUserLists()[0]
					if (!target) throw new Error('没有自建歌单')
					logInfo('[dev] updateUserList start', target.name, 'source=', String(target.source ?? '-'), 'sid=', String(target.sourceListId ?? '-'))
					const r = await lib.updateUserListFromSource(target.id)
					logInfo('[dev] updateUserList result', JSON.stringify(r))
				} else if (action === 'playBoard') {
					// 验证榜单取流：dump 第一首的 Track 字段并尝试播放
					const bsrc = String((params as any).source ?? 'kw')
					const bid = String((params as any).id ?? '')
					const { getBoardDetail } = await import('@/jk/musicSdk')
					const { jkToTrack } = await import('@/jk/adapt')
					const detail = await getBoardDetail(bsrc as any, bid, 1)
					const tracks = (detail.list ?? []).map((m: any) => jkToTrack(m))
					if (!tracks.length) throw new Error('榜单为空')
					const wantIdx = Math.max(0, Number((params as any).index ?? 0) || 0)
					const first: any = tracks[Math.min(wantIdx, tracks.length - 1)]
					logInfo('[dev] playBoard first=', JSON.stringify({
						id: first?.id, platform: first?.platform, title: first?.title,
						songmid: first?.songmid, duration: first?.duration,
					}))
					const tp: any = (await import('@/helpers/trackPlayerIndex')).default
					await tp.playWithReplacePlayList(first, tracks)
				} else if (action === 'toggleLove') {
					// 验证播放页收藏：对当前曲目 toggle 我的收藏
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					const { trackToJk } = await import('@/jk/adapt')
					const lib = await import('@/jk/libraryStore')
					const cur: any = (tp as any).getCurrentMusic?.()
					if (!cur) throw new Error('当前没有播放曲目')
					const jk = trackToJk(cur)
					lib.toggleLove(jk)
					logInfo('[dev] toggleLove', String(jk.name ?? ''), 'inLove=', lib.isInLoveList(jk), 'count=', lib.getLoveList().length)
				} else if (action === 'resume') {
					// 继续播放当前曲目（验证「保存播放进度」恢复位置）
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					await (tp as any).play()
					logInfo('[dev] resume play')
				} else if (action === 'playUserList') {
					// 从「我的列表」里的某个歌单播放（诊断连跳问题用）
					const name = String((params as any).name ?? '')
					const idx = Math.max(0, Number((params as any).index ?? 0) || 0)
					const lib = await import('@/jk/libraryStore')
					const { jkToTrack } = await import('@/jk/adapt')
					const { default: tp } = await import('@/helpers/trackPlayerIndex')
					const all: any[] = [
						{ name: '试听列表', list: lib.getDefaultList() },
						{ name: '我的收藏', list: lib.getLoveList() },
						...lib.getUserLists().map((l: any) => ({ name: l.name, list: l.list })),
					]
					const hit = all.find(l => l.name === name) ?? all.find(l => l.name.includes(name))
					if (!hit) throw new Error(`找不到列表: ${name}`)
					const tracks: any[] = (hit.list ?? []).map((m: any) => jkToTrack(m))
					if (!tracks.length) throw new Error('列表为空')
					const target = tracks[Math.min(idx, tracks.length - 1)]
					logInfo(`[dev] playUserList name=${hit.name} idx=${idx} total=${tracks.length} title=${target?.title ?? ''}`)
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
					// 玻璃透明度真源是 glassAlphaStore/PersistStatus（不是 settingsStore），
					// dev 深链要调用 setGlassAlpha，否则改了没反应
					if (k === 'app.glassAlpha') {
						try {
							const { setGlassAlpha } = await import('@/constants/glass')
							setGlassAlpha(Number(parsed))
						} catch { /* ignore */ }
					}
					// 音量/倍速：与设置页滑块一致，立即作用于播放器（dev 深链验证用）
					if (k === 'player.playbackRate' || k === 'player.volume') {
						try {
							const tp: any = (await import('@/helpers/trackPlayerIndex')).default
							if (k === 'player.playbackRate') tp.setRate?.(Number(parsed))
							else tp.setVolume?.(Number(parsed))
						} catch { /* ignore */ }
					}
					// 歌词字号/延迟的真源是 PersistStatus（播放页 +/- 写的就是它），dev 深链要同步写
					if (k === 'lyric.detailFontSize' || k === 'lyric.delaySeconds') {
						try {
							const ps = (await import('@/store/PersistStatus')).default
							if (k === 'lyric.detailFontSize') ps.set('lyric.detailFontSize', Number(parsed))
							else {
								ps.set('lyric.delaySeconds', Number(parsed))
								const lm: any = await import('@/helpers/lyricManager')
								await (lm.default ?? lm).refreshLyric?.()
							}
						} catch { /* ignore */ }
					}
					logInfo(`[jk/dev] set ${k}=${rawV}`)
				} else if (action === 'cleardev') {
					setSetting('_dev.forceBadUrl', false)
					setSetting('_dev.slowBufferMs', 0)
					setSetting('download.cacheLimitMb', 500)
					logInfo('[jk/dev] 已清理 dev 标志')
				} else if (action === 'badurl') {
					const target = String((params as any).url ?? '')
					setSetting('_dev.forceBadUrl', /^https?:/.test(target) ? target : true)
					logInfo('[jk/play] 已开启坏 URL 实验:', target || '默认 127.0.0.1:9')
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
				} else if (action === 'importList') {
					const url = String((params as any).url ?? '')
					if (!url) throw new Error('缺少 url')
					const detect = () => {
						if (/y\.qq\.com|qq\.com\/n3\/other\/pages\/details/i.test(url)) return 'tx'
						if (/kuwo\.cn|k\.kuwo\.cn/i.test(url)) return 'kw'
						if (/kugou\.com/i.test(url)) return 'kg'
						if (/163\.cn|music\.163/i.test(url)) return 'wy'
						if (/migu|12530/i.test(url)) return 'mg'
						return 'tx'
					}
					const source = detect()
					const lib = await import('@/jk/libraryStore')
					const sdk = await import('@/jk/musicSdk')
					const sid = await lib.resolveSourceListId(url)
					logInfo('[dev] importList source=', source, 'resolvedId=', sid)
					if (!sid) throw new Error('无法解析歌单 id')
					const all: any[] = []
					const seen = new Set<string>()
					let name = ''
					let coverImg = ''
					for (let page = 1; page <= 20; page++) {
						const res: any = await sdk.getSongListDetail(source as any, sid, page)
						const chunk: any[] = res?.list ?? []
						if (!name && res?.info?.name) name = String(res.info.name)
						if (!coverImg && res?.info?.img) coverImg = String(res.info.img)
						for (const m of chunk) {
							const k = `${m?.source}:${m?.id}`
							if (!m?.id || seen.has(k)) continue
							seen.add(k)
							all.push(m)
						}
						if (chunk.length < 100) break
					}
					const uniq = new Set(all.map((m: any) => `${m.source}:${m.id}`))
					logInfo('[dev] importList fetched count=', all.length, 'unique=', uniq.size, 'name=', name)
					logInfo('[dev] importList sample=', JSON.stringify(all.slice(0, 3).map((m: any) => ({ id: m.id, name: m.name, source: m.source }))))
					const created = lib.createUserList(name || `导入歌单 ${new Date().toLocaleDateString()}`)
					const { normalizeCoverUrl } = await import('@/jk/covers')
					const coverUrl = normalizeCoverUrl(coverImg)
					lib.setUserLists(lib.getUserLists().map(item => (
						item.id === created.id
							? {
								...item,
								source,
								sourceListId: sid,
								list: all,
								locationUpdateTime: Date.now(),
								...(coverUrl ? { coverUrl, coverUpdatedAt: Date.now() } : {}),
							}
							: item
					)))
					logInfo('[dev] importList ok listId=', created.id, 'count=', all.length, 'cover=', coverUrl)
				} else if (action === 'dumpCover') {
					const lib = await import('@/jk/libraryStore')
					const { resolveListCover, firstSongCover } = await import('@/jk/covers')
					for (const l of lib.getUserLists()) {
						logInfo('[dev] dumpCover', JSON.stringify({
							name: l.name,
							source: l.source ?? '',
							sid: String(l.sourceListId ?? '').slice(0, 40),
							coverUrl: l.coverUrl ?? '',
							coverFile: l.coverFile ?? '',
							resolved: resolveListCover(l),
							firstSong: firstSongCover(l.list),
							count: l.list.length,
							firstMetaKeys: l.list.length ? Object.keys((l.list[0] as any)?.meta ?? {}).slice(0, 12).join(',') : '',
							firstMetaImg: String((l.list[0] as any)?.meta?.img ?? '').slice(0, 60),
						}))
					}
				} else if (action === 'setCoverUrl') {
					const name = String((params as any).name ?? '')
					const url = String((params as any).url ?? '')
					const lib = await import('@/jk/libraryStore')
					const { normalizeCoverUrl } = await import('@/jk/covers')
					const target = lib.getUserLists().find(l => l.name === name) ?? lib.getUserLists().find(l => l.name.includes(name))
					if (!target) throw new Error(`找不到歌单: ${name}`)
					lib.setUserListCover(target.id, { coverUrl: normalizeCoverUrl(url) })
					logInfo('[dev] setCoverUrl', target.name, '=>', normalizeCoverUrl(url))
				} else if (action === 'soundEffect') {
					// 免点击验收：jkmusic://settingSection/dev?action=soundEffect&enabled=1&preset=rock&dry=18&pan=0&r=5&speed=25
					const { setSetting: setS, getSetting: getS } = await import('@/jk/settingsStore')
					const se = await import('@/jk/soundEffect')
					if ((params as any).enabled !== undefined) {
						setS(se.SOUND_EFFECT_KEYS.enabled, String((params as any).enabled) === '1')
					}
					if ((params as any).preset) {
						const name = String((params as any).preset)
						const hit = se.EQ_PRESETS.find(p => p.id === name || p.zh === name)
						if (!hit) throw new Error(`未知预设: ${name}`)
						se.setEqGains(hit.gains)
					}
					if ((params as any).dry !== undefined) {
						setS(se.SOUND_EFFECT_KEYS.mainGain, Math.round(Number((params as any).dry)))
					}
					if ((params as any).pan !== undefined) {
						setS(se.SOUND_EFFECT_KEYS.pannerEnabled, String((params as any).pan) === '1')
					}
					if ((params as any).r !== undefined) {
						setS(se.SOUND_EFFECT_KEYS.pannerSoundR, Math.round(Number((params as any).r)))
					}
					if ((params as any).speed !== undefined) {
						setS(se.SOUND_EFFECT_KEYS.pannerSpeed, Math.round(Number((params as any).speed)))
					}
					se.applySoundEffect(true)
					logInfo('[dev] soundEffect', JSON.stringify(se.getSoundEffectConfig()), 'enabledSetting=', String(getS(se.SOUND_EFFECT_KEYS.enabled, false)))
				} else if (action === 'soundEffectDump') {
					const se = await import('@/jk/soundEffect')
					logInfo('[dev] soundEffectDump', JSON.stringify(se.getSoundEffectConfig()))
				} else if (action === 'diag') {
					// 免点击验收：jkmusic://settingSection/dev?action=diag&kind=switch&title=xx&from=tx&to=kw&reason=起播超时
					const m = await import('@/jk/playbackDiagnostics')
					m.recordDiagnostic({
						kind: (String((params as any).kind ?? 'switch') as any),
						title: String((params as any).title ?? '测试曲'),
						from: String((params as any).from ?? 'tx'),
						to: String((params as any).to ?? 'kw'),
						reason: String((params as any).reason ?? '起播超时'),
						detail: String((params as any).detail ?? ''),
					})
					logInfo('[dev] diag recorded')
				} else if (action === 'coverSet') {
					// 免相册验收：把沙盒里的图片设为自定义封面
					const name = String((params as any).name ?? '')
					const path = String((params as any).path ?? '')
					if (!path) throw new Error('缺少 path')
					const lib = await import('@/jk/libraryStore')
					const { saveCoverFrom } = await import('@/jk/covers')
					const target = lib.getUserLists().find(l => l.name === name) ?? lib.getUserLists().find(l => l.name.includes(name))
					if (!target) throw new Error(`找不到歌单: ${name}`)
					const file = await saveCoverFrom(path, target.id)
					lib.setUserListCover(target.id, { coverFile: file })
					logInfo('[dev] coverSet', target.name, '=>', file)
				} else if (action === 'coverReset') {
					const name = String((params as any).name ?? '')
					const lib = await import('@/jk/libraryStore')
					const { deleteCover } = await import('@/jk/covers')
					const target = lib.getUserLists().find(l => l.name === name) ?? lib.getUserLists().find(l => l.name.includes(name))
					if (!target) throw new Error(`找不到歌单: ${name}`)
					const prev = target.coverFile
					lib.clearUserListCover(target.id)
					if (prev) await deleteCover(prev)
					logInfo('[dev] coverReset', target.name)
				} else if (action === 'coverFiles') {
					// 列出沙盒里的封面文件，验证删除是否生效
					const FS = await import('expo-file-system/legacy')
					const dir = `${String((FS as any).documentDirectory ?? '')}covers/`
					const info: any = await (FS as any).getInfoAsync(dir)
					if (!info?.exists) { logInfo('[dev] coverFiles dir missing'); return }
					const names = await (FS as any).readDirectoryAsync(dir)
					logInfo('[dev] coverFiles', dir, JSON.stringify(names))
				} else if (action === 'clearCover') {
					const name = String((params as any).name ?? '')
					const lib = await import('@/jk/libraryStore')
					const target = lib.getUserLists().find(l => l.name === name) ?? lib.getUserLists().find(l => l.name.includes(name))
					if (!target) throw new Error(`找不到歌单: ${name}`)
					lib.clearUserListCover(target.id)
					logInfo('[dev] clearCover', target.name)
				} else if (action === 'dumpList') {
					const name = String((params as any).name ?? '')
					const lib = await import('@/jk/libraryStore')
					const lists = lib.getUserLists()
					const hit = lists.find((l: any) => l.name === name) ?? lists.find((l: any) => l.name.includes(name))
					if (!hit) throw new Error(`找不到歌单: ${name}`)
					const uniq = new Set(hit.list.map((m: any) => `${m.source}:${m.id}`))
					logInfo('[dev] dumpList name=', hit.name, 'count=', hit.list.length, 'uniqueKeys=', uniq.size)
					logInfo('[dev] dumpList sample=', JSON.stringify(hit.list.slice(0, 5).map((m: any) => ({ id: m.id, name: m.name, source: m.source }))))
				} else if (action === 'artistTest') {
					const name = String((params as any).name ?? '')
					try {
						const u = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=5&w=${encodeURIComponent(name)}&format=json`
						const r = await fetch(u, { headers: { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0' } })
						const txt = await r.text()
						logInfo('[dev] artistRaw status=', r.status, 'len=', txt.length, 'head=', txt.slice(0, 160))
						const j = JSON.parse(txt)
						const list = j?.data?.song?.list ?? []
						logInfo('[dev] artistRaw songs=', list.length, 'singers=', JSON.stringify(list.slice(0, 2).map((x: any) => (x?.singer ?? []).map((s: any) => s?.name))))
					} catch (e) {
						logError('[dev] artistRaw failed', String((e as any)?.message ?? e))
					}
					const { getSingerMidBySingerName } = await import('@/helpers/userApi/getMusicSource')
					const mid = await getSingerMidBySingerName(name)
					logInfo('[dev] artistTest', name, '->', mid || '(null)')
				} else if (action === 'dlprobe') {
					const { scanDownloads } = await import('@/jk/downloadStore')
					const { normalizeQuality } = await import('@/jk/downloader')
					const list = await scanDownloads()
					const rows = list.map((i: any) => ({
						n: i.name,
						mb: Number(((i.size ?? 0) / 1024 / 1024).toFixed(1)),
						q: normalizeQuality(String(i.meta?.quality ?? ''), i.size, i.name),
						br: i.meta?.bitrate ?? '',
					}))
					const counts: any = { '128k': 0, '320k': 0, flac: 0, unknown: 0 }
					for (const r of rows) counts[r.q] = (counts[r.q] ?? 0) + 1
					logInfo('[dev] dlprobe', JSON.stringify({ counts, rows }))
				} else if (action === 'settextcolor') {
					let v = decodeURIComponent(String((params as any).v ?? 'FFFFFF'))
					if (!v.startsWith('#')) v = '#' + v
					const { setTextColor } = await import('@/jk/themeStore')
					setTextColor(v)
					logInfo('[dev] settextcolor', v)
				} else if (action === 'setglass') {
					const v = Number((params as any).v ?? 44)
					const { setGlassAlpha } = await import('@/constants/glass')
					setGlassAlpha(Math.min(1, Math.max(0, v / 100)))
					logInfo('[dev] setglass', String(v) + '%')
				} else if (action === 'clipsim') {
					const g4: any = globalThis
					g4.__JK_CLIP_SIM__ = String((params as any).on ?? '1') === '1'
					logInfo('[jk/dev] clipsim =', String(g4.__JK_CLIP_SIM__))
				} else if (action === 'nativePause') {
					// 只暂停原生播放器、不改「播放意图」，用来验证 15s 停滞检测
					const RNT = (await import('@rntp/player')).default
					await (RNT as any).pause?.()
					logInfo('[jk/dev] nativePause（用于验证停滞检测）')
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
		if (section === 'soundEffect') return <SoundEffectPanel />
		if (section === 'list') return <ListSection />
		if (section === 'backup') return <BackupSection />
		if (section === 'download') return <DownloadSection />
		if (section === 'detail') return <PlayDetailSection />
		if (section === 'search') return <SearchSection />
		if (section === 'other') return <OtherSection />
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
