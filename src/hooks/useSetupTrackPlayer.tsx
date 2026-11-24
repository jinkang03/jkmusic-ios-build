import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { applySoundEffect } from '@/jk/soundEffect'
import { useEffect } from 'react'
import TrackPlayer, { PlayerCommand, RepeatMode } from '@rntp/player'

let nativeConfigured = false

const setupPlayer = () => {
	if (nativeConfigured) return
	TrackPlayer.setupPlayer({
		progressSync: { intervalSeconds: 1 },
		autoUpdateMetadataFromStream: false,
		// 启用 RNTP 内置的流式缓存代理：边下边播 + 本地回环 + 预加载窗口。
		// 不传 cache 时 proxyServer 为 nil，会退化成 AVPlayer 直连（本环境加载不了）。
		cache: {
			maxSizeBytes: 500 * 1024 * 1024,
			preloading: { window: 2 },
		},
	} as any)
	TrackPlayer.setCommands({
		capabilities: [
			PlayerCommand.PlayPause,
			PlayerCommand.Next,
			PlayerCommand.Previous,
			PlayerCommand.Stop,
			PlayerCommand.Seek,
		],
		handling: 'hybrid',
		perCommandHandling: {
			[PlayerCommand.Next]: 'js',
			[PlayerCommand.Previous]: 'js',
		},
	})

	TrackPlayer.setVolume(1)
	TrackPlayer.setRepeatMode(RepeatMode.Off)
	TrackPlayer.setShuffleEnabled(false)
	// 音效：把持久化的配置推给原生（默认关闭，关闭时不会挂 tap）
	applySoundEffect(true)
	nativeConfigured = true
}

let initialization: Promise<void> | undefined

const initializePlayer = () => {
	if (!initialization) {
		initialization = Promise.resolve().then(setupPlayer)
			.then(() => myTrackPlayer.setupTrackPlayer())
			.catch((error) => {
				initialization = undefined
				throw error
			})
	}
	return initialization
}

export const useSetupTrackPlayer = ({ onLoad }: { onLoad?: () => void }) => {
	useEffect(() => {
		let mounted = true

		initializePlayer()
			.then(() => {
				if (mounted) onLoad?.()
			})
			.catch((error) => {
				console.error(error)
			})

		return () => {
			mounted = false
		}
	}, [onLoad])
}
