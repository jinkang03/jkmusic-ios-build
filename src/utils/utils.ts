import { toOldMusicInfo } from '@/components/utils'
import { requestMsg } from '@/components/utils/message'
import musicSdk from '@/components/utils/musicSdk'
import Toast from 'react-native-toast-message'

export const getOnlineOtherSourceMusicUrl = async ({
	musicInfos,
	quality,
	onToggleSource,
	isRefresh,
	retryedSource = [],
}: {
	musicInfos: LX.Music.MusicInfoOnline[]
	quality?: LX.Quality
	onToggleSource: (musicInfo?: LX.Music.MusicInfoOnline) => void
	isRefresh: boolean
	retryedSource?: LX.OnlineSource[]
}): Promise<{
	url: string
	musicInfo: LX.Music.MusicInfoOnline
	quality: LX.Quality
	isFromCache: boolean
}> => {
	if (!(await global.lx.apiInitPromise[0])) throw new Error('source init failed')

	let musicInfo: LX.Music.MusicInfoOnline | null = null
	let itemQuality: LX.Quality | null = null
	// eslint-disable-next-line no-cond-assign
	while ((musicInfo = musicInfos.shift()!)) {
		if (retryedSource.includes(musicInfo.source)) continue
		retryedSource.push(musicInfo.source)
		//if (!assertApiSupport(musicInfo.source)) continue
		//  itemQuality = quality ?? 'getPlayQuality(settingState.setting['player.isPlayHighQuality'], musicInfo)'
		itemQuality = quality ?? '128k'
		if (!musicInfo.meta._qualitys[itemQuality]) continue

		console.log(
			'try toggle to: ',
			musicInfo.source,
			musicInfo.name,
			musicInfo.singer,
			musicInfo.interval,
		)
		onToggleSource(musicInfo)
		break
	}
	if (!musicInfo || !itemQuality) throw new Error(global.i18n.t('toggle_source_failed'))
	//todo cache
	// const cachedUrl = await getStoreMusicUrl(musicInfo, itemQuality)
	// if (cachedUrl && !isRefresh) return { url: cachedUrl, musicInfo, quality: itemQuality, isFromCache: true }

	// 取流参数留痕：失败排查时要能对上 songmid / quality
	// eslint-disable-next-line no-console
	console.log(`[jk/play] url req source=${musicInfo.source} songmid=${(musicInfo as any)?.meta?.songmid ?? musicInfo.id} quality=${itemQuality}`)
	let reqPromise
	try {
		reqPromise = musicSdk[musicInfo.source].getMusicUrl(
			toOldMusicInfo(musicInfo),
			itemQuality,
		).promise
	} catch (err: any) {
		reqPromise = Promise.reject(err)
	}
	// retryedSource.includes(musicInfo.source)
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	return reqPromise
		.then(({ url, type }: { url: string; type: LX.Quality }) => {
			return { musicInfo, url, quality: type, isFromCache: false }
			// eslint-disable-next-line @typescript-eslint/promise-function-async
		})
		.catch(async(err: any) => {
			if (err.message == requestMsg.tooManyRequests) throw err
			// eslint-disable-next-line no-console
			console.log('[jk/play] 取流失败', musicInfo.source, err?.message ?? err)
			// 失败必须可见：先提示正在换源，换源再失败会在下面抛错
			showToast(
				`获取播放地址失败（${musicInfo.source}）`,
				String(err?.message ?? err).slice(0, 80),
				'error',
			)
			return getOnlineOtherSourceMusicUrl({
				musicInfos,
				quality,
				onToggleSource,
				isRefresh,
				retryedSource,
			})
		})
}
export const showToast = (
	message1: string,
	message2?: string,
	type: 'success' | 'error' | 'info' = 'success',
) => {
	Toast.show({
		type: type,
		text1: message1,
		text2: message2 ?? '',
		visibilityTime: 2000,
		autoHide: true,
		topOffset: 80,
		bottomOffset: 40,
		onShow: () => {
			console.log('Toast showed')
		},
		onHide: () => {
			console.log('Toast hidden')
		},
		onPress: () => {
			Toast.hide()
		},
	})
}
