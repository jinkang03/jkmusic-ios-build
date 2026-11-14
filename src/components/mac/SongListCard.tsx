/**
 * 桌面版歌单卡（左图右文）：84×84 方形封面 + 标题 2 行 + 作者 + 「曲目数 · 播放量」。
 * 播放量按 1.3万 / 90万 / 3.4亿 缩写。
 */
import React from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View } from 'react-native'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'

export const formatPlayCount = (value?: number | string): string => {
	// kw 的 play_count 本身就是 "1.3万" 这种已格式化字符串，原样返回
	if (typeof value === 'string' && /[万亿]/.test(value)) return value.trim()
	const raw = typeof value === 'string' ? value.replace(/[^\d.]/g, '') : value
	const n = Number(raw ?? 0)
	if (!Number.isFinite(n) || n <= 0) return ''
	if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`
	if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, '')}万`
	return String(Math.round(n))
}

// 标题里的 emoji 在 iOS 该字号下会渲染成方框，直接过滤掉非 BMP / 符号区字符
const clean = (s: string) => String(s ?? '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\uFE0F/g, '').trim()

const SongListCard = ({
	title,
	cover,
	author,
	trackCount,
	playCount,
	onPress,
}: {
	title: string
	cover?: string
	author?: string
	cover_url?: string
	trackCount?: number | string
	playCount?: number | string
	onPress?: () => void
}) => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => ({
				flexDirection: 'row',
				gap: 12,
				paddingVertical: 10,
				paddingHorizontal: macSpace.pageX / 2,
				backgroundColor: pressed ? c.fillSubtle : 'transparent',
				borderBottomWidth: 0.5,
				borderBottomColor: c.divider,
			})}
		>
			<Image
				source={{ uri: cover || undefined }}
				style={{ width: 84, height: 84, borderRadius: macRadius.thumb, backgroundColor: c.fillMuted }}
				contentFit="cover"
			/>
			<View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
				<Text numberOfLines={2} style={{ color: c.text, fontSize: macFont.cardTitle }}>{clean(title)}</Text>
				{author ? (
					<Text numberOfLines={1} style={{ color: c.textMuted, fontSize: macFont.caption }}>{author}</Text>
				) : null}
				{(() => {
					// kw 的 list 接口只返回 id/name/img/desc/source，没有作者与播放量，
					// 缺数据就不渲染这一行，不要造假占位
					const meta = [
						Number(trackCount ?? 0) > 0 ? `曲目 ${Number(trackCount)}` : '',
						formatPlayCount(playCount) ? `播放 ${formatPlayCount(playCount)}` : '',
					].filter(Boolean).join(' · ')
					return meta ? (
						<Text style={{ color: c.textMuted, fontSize: macFont.caption }}>{meta}</Text>
					) : null
				})()}
			</View>
		</Pressable>
	)
}

export default SongListCard
