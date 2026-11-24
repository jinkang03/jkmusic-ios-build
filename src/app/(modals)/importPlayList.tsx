import { unknownTrackImageUri } from '@/constants/images'
import { ThemeColors, screenPadding } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { getPlayListFromQ } from '@/helpers/userApi/getMusicSource'
import { useThemeColors } from '@/hooks/useAppTheme'
import { useDefaultStyles } from '@/styles'
import { Ionicons } from '@expo/vector-icons'
import { useHeaderHeight } from 'expo-router/react-navigation'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import React, { useMemo, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Image,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

const ImportPlayList = () => {
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const styles = useMemo(() => createStyles(colors, defaultStyles), [colors, defaultStyles])
	const [playlistUrl, setPlaylistUrl] = useState('')
	const [playlistData, setPlaylistData] = useState(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState(null)
	const [customName, setCustomName] = useState('')
	const [coverImage, setCoverImage] = useState(null)

	const nameInputRef = useRef(null)
	const urlInputRef = useRef(null)

	const headerHeight = useHeaderHeight()
	const { top } = useSafeAreaInsets()

	const pickImage = async () => {
		try {
			const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
			if (!perm.granted) {
				setError('需要相册权限才能选择封面')
				return
			}
			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ['images'] as any,
				allowsEditing: true,
				aspect: [1, 1],
				quality: 0.9,
			})
			if (!result.canceled && result.assets?.[0]?.uri) {
				setCoverImage(result.assets[0].uri)
			}
		} catch (err) {
			logError('选择封面失败:', err)
			setError('选择封面失败')
		}
	}

	const handleCreatePlaylist = async () => {
		if (!customName.trim()) {
			setError('请输入歌单名称')
			return
		}
		setIsLoading(true)
		setError(null)
		console.log('coverImage', coverImage)
		try {
			// 写入 libraryStore（「我的列表」读的就是它），旧 addPlayLists 写的是没人读的旧 store
			const lib = await import('@/jk/libraryStore')
			const list = lib.createUserList(customName.trim())
			// 创建时选的封面存进沙盒（选图是临时 URI，不复制会失效）
			if (coverImage) {
				try {
					const { saveCoverFrom } = await import('@/jk/covers')
					const file = await saveCoverFrom(String(coverImage), list.id)
					lib.setUserListCover(list.id, { coverFile: file })
					logInfo('[importPlayList] cover saved', file)
				} catch (coverErr) {
					logError('封面保存失败:', coverErr)
				}
			}
			logInfo('[importPlayList] created', list.id, list.name)
			router.dismiss()
		} catch (err) {
			setError('创建失败，请重试')
			logError('创建错误:', err)
		} finally {
			setIsLoading(false)
		}
	}

	const handleImport = async () => {
		setIsLoading(true)
		setError(null)
		try {
			const url = playlistUrl.trim()
			if (!url) throw new Error('链接不能为空')
			// 识别平台 + 提取歌单 id
			const detect = (): { source: string, rawId: string } => {
				if (/y\.qq\.com|qq\.com\/n3\/other\/pages\/details/i.test(url)) {
					return { source: 'tx', rawId: url }
				}
				if (/kuwo\.cn|k\.kuwo\.cn/i.test(url)) return { source: 'kw', rawId: url }
				if (/kugou\.com/i.test(url)) return { source: 'kg', rawId: url }
				if (/163\.cn|music\.163/i.test(url)) return { source: 'wy', rawId: url }
				if (/migu|12530/i.test(url)) return { source: 'mg', rawId: url }
				return { source: 'tx', rawId: url }
			}
			const { source, rawId } = detect()
			const lib = await import('@/jk/libraryStore')
			const sdk = await import('@/jk/musicSdk')
			const sourceListId = await lib.resolveSourceListId(rawId)
			if (!sourceListId) throw new Error('无法从链接中解析歌单 id')
			logInfo('[importPlayList] importing source=', source, 'id=', sourceListId)
			const all: any[] = []
			const seen = new Set<string>()
			let listName = ''
			let listCover = ''
			let expectedTotal = 0
			for (let page = 1; page <= 20; page++) {
				const res: any = await sdk.getSongListDetail(source as any, sourceListId, page)
				const chunk: any[] = res?.list ?? []
				if (!listName && res?.info?.name) listName = String(res.info.name)
				if (!listCover && res?.info?.img) listCover = String(res.info.img)
				if (!expectedTotal && Number(res?.total) > 0) expectedTotal = Number(res.total)
				for (const m of chunk) {
					const k = `${m?.source}:${m?.id}`
					if (!m?.id || seen.has(k)) continue
					seen.add(k)
					all.push(m)
				}
				if (chunk.length < 100) break
			}
			if (!all.length) throw new Error('歌单为空或链接失效')
			const created = lib.createUserList(listName || `导入歌单 ${new Date().toLocaleDateString()}`)
			const { normalizeCoverUrl } = await import('@/jk/covers')
			const coverUrl = normalizeCoverUrl(listCover)
			lib.setUserLists(lib.getUserLists().map(item => (
				item.id === created.id
					? {
						...item,
						source,
						sourceListId,
						list: all,
						locationUpdateTime: Date.now(),
						...(coverUrl ? { coverUrl, coverUpdatedAt: Date.now() } : {}),
					}
					: item
			)))
			logInfo('[importPlayList] imported', source, sourceListId, 'count=', all.length, 'total=', expectedTotal)
			// kg 的 gcid 分享页只给前 10 首：明确告诉用户，而不是装作成功
			if (expectedTotal > all.length) {
				const { showToast } = await import('@/utils/utils')
				showToast('提示', `该歌单共 ${expectedTotal} 首，分享页仅提供 ${all.length} 首`, 'info')
			}
			router.dismiss()
		} catch (err) {
			setError('导入失败，请检查链接是否正确')
			// myTrackPlayer.deletePlayLists('7570659434')
			logError('导入错误:', err)
		} finally {
			setIsLoading(false)
		}
	}

	const DismissPlayerSymbol = () => (
		<View style={[styles.dismissSymbol, { top: top - 25 }]}>
			<View style={styles.dismissBar} />
		</View>
	)

	return (
		<SafeAreaView style={[styles.modalContainer, { paddingTop: headerHeight }]}>
			<DismissPlayerSymbol />
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				style={{ flex: 1 }}
			>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ flexGrow: 1 }}
					keyboardShouldPersistTaps="handled"
				>
					<Text style={styles.header}>导入/创建歌单</Text>

					<View style={styles.section}>
						<Text style={styles.sectionTitle}>创建新歌单</Text>
						<View style={styles.createPlaylistCard}>
							<View style={styles.createPlaylistContainer}>
								<View style={styles.coverContainer}>
									<TouchableOpacity onPress={pickImage} style={styles.coverPicker}>
										{coverImage ? (
											<Image source={{ uri: coverImage }} style={styles.coverImage} />
										) : (
											<View style={styles.coverPlaceholder}>
												<Ionicons name="image-outline" size={24} color={colors.primary} />
												<Text style={styles.coverText}>选择封面</Text>
											</View>
										)}
									</TouchableOpacity>
								</View>

								<View style={styles.playlistInfoContainer}>
									<View style={[styles.inputContainer, { marginBottom: 0 }]}>
										<TextInput
											ref={nameInputRef}
											style={styles.input}
											value={customName}
											onChangeText={setCustomName}
											placeholder="输入歌单名称"
											placeholderTextColor={colors.placeholder}
											autoCapitalize="none"
											autoCorrect={false}
											keyboardType="default"
											returnKeyType="done"
											blurOnSubmit={true}
											onSubmitEditing={() => nameInputRef.current?.blur()}
											enablesReturnKeyAutomatically={true}
											clearButtonMode="while-editing"
										/>
									</View>
								</View>
							</View>

							<TouchableOpacity
								onPress={handleCreatePlaylist}
								activeOpacity={0.8}
								style={styles.button}
								disabled={isLoading}
							>
								{isLoading ? (
									<ActivityIndicator color={colors.loading} />
								) : (
									<>
										<Ionicons name="add-circle-outline" size={24} color={colors.primary} />
										<Text style={styles.buttonText}>创建歌单</Text>
									</>
								)}
							</TouchableOpacity>
						</View>
					</View>

					<View style={styles.divider} />

					<View style={styles.section}>
						<Text style={styles.sectionTitle}>导入已有歌单</Text>
						<View style={styles.createPlaylistCard}>
							<View style={styles.importContainer}>
								<TextInput
									ref={urlInputRef}
									style={styles.input}
									value={playlistUrl}
									onChangeText={setPlaylistUrl}
									placeholder='🔗输入企鹅音乐歌单链接要有"id="字样'
									placeholderTextColor={colors.placeholder}
									autoCapitalize="none"
									autoCorrect={false}
									keyboardType="url"
									returnKeyType="done"
									blurOnSubmit={true}
									onSubmitEditing={() => urlInputRef.current?.blur()}
									enablesReturnKeyAutomatically={true}
									clearButtonMode="while-editing"
								/>
							</View>

							<TouchableOpacity
								onPress={handleImport}
								activeOpacity={0.8}
								style={styles.button}
								disabled={isLoading}
							>
								{isLoading ? (
									<ActivityIndicator color={colors.loading} />
								) : (
									<>
										<Ionicons name="cloud-download-outline" size={24} color={colors.primary} />
										<Text style={styles.buttonText}>导入歌单</Text>
									</>
								)}
							</TouchableOpacity>
						</View>
					</View>

					{error && <Text style={styles.error}>{error}</Text>}
					{playlistData && (
						<Text style={styles.successText}>导入成功! 歌单名称: {playlistData.name}</Text>
					)}
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	)
}

const createStyles = (
	colors: ThemeColors,
	defaultStyles: ReturnType<typeof useDefaultStyles>,
) =>
	StyleSheet.create({
	modalContainer: {
		...defaultStyles.container,
		paddingHorizontal: screenPadding.horizontal,
	},
	section: {
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '600',
		color: colors.text,
		marginBottom: 16,
	},
	divider: {
		height: 1,
		backgroundColor: colors.separator,
		marginVertical: 24,
	},
	buttonContainer: {
		marginTop: 0,
	},
	dismissSymbol: {
		position: 'absolute',
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'center',
		zIndex: 1,
	},
	dismissBar: {
		width: 50,
		height: 5,
		borderRadius: 2.5,
		backgroundColor: colors.dismissBar,
	},
	inputContainer: {
		width: '100%',
	},
	inputLabel: {
		fontSize: 16,
		fontWeight: '600',
		color: colors.text,
		marginBottom: 8,
	},
	header: {
		fontSize: 31,
		fontWeight: 'bold',
		padding: 0,
		paddingTop: 5,
		marginBottom: 24,
		color: colors.text,
	},
	input: {
		height: 44,
		backgroundColor: colors.surfaceMuted,
		borderRadius: 8,
		paddingHorizontal: 16,
		fontSize: 16,
		color: colors.text,
		width: '100%',
	},
	coverContainer: {
		width: 100,
	},
	coverPicker: {
		width: 100,
		height: 100,
		borderRadius: 8,
		overflow: 'hidden',
		backgroundColor: colors.surfaceMuted,
		justifyContent: 'center',
		alignItems: 'center',
	},
	coverImage: {
		width: '100%',
		height: '100%',
		resizeMode: 'cover',
	},
	coverPlaceholder: {
		width: '100%',
		height: '100%',
		justifyContent: 'center',
		alignItems: 'center',
	},
	coverText: {
		color: colors.primary,
		marginTop: 8,
		fontSize: 14,
	},
	error: {
		color: colors.error,
		marginTop: 10,
	},
	successText: {
		color: colors.success,
		marginTop: 10,
	},
	button: {
		padding: 12,
		backgroundColor: colors.surfaceMuted,
		borderRadius: 8,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		columnGap: 8,
		width: '100%',
	},
	buttonText: {
		...defaultStyles.text,
		color: colors.primary,
		fontWeight: '600',
		fontSize: 18,
		textAlign: 'center',
	},
	createPlaylistCard: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: 16,
		gap: 16,
	},
	createPlaylistContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		columnGap: 16,
	},
	playlistInfoContainer: {
		flex: 1,
		height: 100,
		justifyContent: 'center',
	},
	importContainer: {
		width: '100%',
	},
	})

export default ImportPlayList
