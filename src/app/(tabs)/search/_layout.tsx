import { getStackScreenWithSearchBar } from '@/constants/layout'
import { useThemeColors } from '@/hooks/useAppTheme'
import { useDefaultStyles } from '@/styles'
import i18n, { nowLanguage } from '@/utils/i18n'
import { Stack } from 'expo-router'
import { View } from 'react-native'
const PlaylistsScreenLayout = () => {
	const language = nowLanguage.useValue()
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	return (
		<View style={{ flex: 1 }} key={language}>
			<Stack>
				<Stack.Screen
					name="index"
					options={{
						// 搜索页用页面内自绘搜索框，关掉原生 header，避免出现两个「搜索」
						headerShown: false,
					}}
				/>

				<Stack.Screen
					name="[name]"
					options={{
						headerTitle: '',
						headerBackVisible: true,
						headerStyle: {
							backgroundColor: colors.background,
						},
						headerTintColor: colors.primary,
					}}
				/>
			</Stack>
		</View>
	)
}

export default PlaylistsScreenLayout
