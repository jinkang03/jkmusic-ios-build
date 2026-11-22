import { ThemeColors } from '@/constants/tokens'
import { Playlist } from '@/helpers/types'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { macPalette, macRadius } from '@/constants/macTokens'
import { useDefaultStyles } from '@/styles'
import { Ionicons } from '@expo/vector-icons'
import { useMemo } from 'react'
import { StyleSheet, Text, TouchableHighlight, TouchableHighlightProps, View } from 'react-native'

type PlaylistListItemProps = {
	playlist: Playlist
} & TouchableHighlightProps

export const PlaylistListItem = ({ playlist, ...props }: PlaylistListItemProps) => {
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const mac = macPalette(!!useAppTheme().isDark)
	const styles = useMemo(() => createStyles(colors, defaultStyles), [colors, defaultStyles])

	// 歌单图标跟随主题色（mac 风格）：主题色淡底 + 主题色心形，不再用远程粉色图
	const tint = mac.primary
	return (
		<TouchableHighlight activeOpacity={0.8} underlayColor={colors.surfaceMuted} {...props}>
			<View style={styles.playlistItemContainer}>
				<View style={[styles.cover, { backgroundColor: `${tint}22` }]}>
					<Ionicons name="heart" size={24} color={tint} />
				</View>

				<View style={styles.right}>
					<Text numberOfLines={1} style={[styles.playlistNameText, { color: mac.text }]}>
						{playlist.title}
					</Text>
					<Text numberOfLines={1} style={[styles.playlistMetaText, { color: mac.textMuted }]}>
						{playlist.description ?? ''}
					</Text>
				</View>

				<Ionicons name="chevron-forward" size={18} color={mac.textMuted} style={{ opacity: 0.6 }} />
			</View>
		</TouchableHighlight>
	)
}

const createStyles = (
	colors: ThemeColors,
	defaultStyles: ReturnType<typeof useDefaultStyles>,
) =>
	StyleSheet.create({
	playlistItemContainer: {
		flexDirection: 'row',
		columnGap: 14,
		alignItems: 'center',
		paddingRight: 4,
		paddingVertical: 10,
	},
	cover: {
		width: 56,
		height: 56,
		borderRadius: macRadius.card,
		alignItems: 'center',
		justifyContent: 'center',
	},
	right: {
		flex: 1,
		justifyContent: 'center',
	},
	playlistNameText: {
		...defaultStyles.text,
		fontSize: 17,
		fontWeight: '600',
	},
	playlistMetaText: {
		color: colors.textMuted,
		fontSize: 12,
		marginTop: 3,
	},
	})
