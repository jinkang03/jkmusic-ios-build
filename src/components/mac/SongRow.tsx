/**
 * 桌面版五列歌曲行：序号 / 歌名(+角标) / 歌手 / 专辑 / 时长。
 * 关键：角标占固定 30 宽，保证后面三列的起始 x 在所有行完全一致；
 * 标题用 flexShrink 收缩而不是靠 numberOfLines 硬截断。
 */
import React from 'react'
import { tr } from '@/utils/i18n'
import { Pressable, Text, useWindowDimensions, View } from 'react-native'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'

export interface SongRowProps {
	index: number
	title: string
	artist?: string
	album?: string
	duration?: string
	badge?: string
	active?: boolean
	onPress?: () => void
}

const COL_INDEX = 28
// 角标现在可能是两字中文（酷我），30 会挤成省略号
const COL_BADGE = 34
const COL_META = '22%'
const COL_TIME = 60

const SongRow = ({ index, title, artist, album, duration, badge, active, onPress }: SongRowProps) => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const { width } = useWindowDimensions()
	const narrow = width < 380

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => ({
				flexDirection: 'row',
				alignItems: 'center',
				height: macSpace.rowHeight,
				paddingHorizontal: macSpace.pageX / 2,
				backgroundColor: pressed ? c.fillSubtle : 'transparent',
				borderBottomWidth: 0.5,
				borderBottomColor: c.divider,
			})}
		>
			<Text style={{ width: COL_INDEX, color: active ? c.primary : c.textMuted, fontSize: macFont.caption }}>{index}</Text>
			<View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
				<Text numberOfLines={1} style={{ flexShrink: 1, color: active ? c.primary : c.text, fontSize: macFont.body }}>
					{title}
				</Text>
				<View style={{ width: badge ? COL_BADGE : 0, marginLeft: badge ? 6 : 0 }}>
					{badge ? (
						<Text numberOfLines={1} style={{ color: c.primary, fontSize: macFont.badge, borderWidth: 1, borderColor: c.primary, borderRadius: 3, paddingHorizontal: 3, textAlign: 'center' }}>
							{badge}
						</Text>
					) : null}
				</View>
			</View>
			{!narrow ? (
				<Text numberOfLines={1} style={{ width: COL_META, color: c.textMuted, fontSize: macFont.caption }}>{artist || '-'}</Text>
			) : null}
			{!narrow ? (
				<Text numberOfLines={1} style={{ width: COL_META, color: c.textMuted, fontSize: macFont.caption }}>{album || '-'}</Text>
			) : null}
			<Text style={{ width: COL_TIME, textAlign: 'right', color: c.textMuted, fontSize: macFont.caption }}>{duration || '--:--'}</Text>
		</Pressable>
	)
}

/** 表头：列宽与 SongRow 完全一致 */
export const SongRowHeader = () => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const { width } = useWindowDimensions()
	const narrow = width < 380
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				height: 32,
				paddingHorizontal: macSpace.pageX / 2,
				borderBottomWidth: 1,
				borderBottomColor: c.divider,
			}}
		>
			<Text style={{ width: COL_INDEX, color: c.textMuted, fontSize: macFont.badge }}>#</Text>
			<Text style={{ flex: 1, color: c.textMuted, fontSize: macFont.badge }}>{tr('歌曲名', 'Title')}</Text>
			{!narrow ? <Text style={{ width: COL_META, color: c.textMuted, fontSize: macFont.badge }}>{tr('艺术家', 'Artist')}</Text> : null}
			{!narrow ? <Text style={{ width: COL_META, color: c.textMuted, fontSize: macFont.badge }}>{tr('专辑名', 'Album')}</Text> : null}
			<Text style={{ width: COL_TIME, textAlign: 'right', color: c.textMuted, fontSize: macFont.badge }}>时长</Text>
		</View>
	)
}

export default SongRow
