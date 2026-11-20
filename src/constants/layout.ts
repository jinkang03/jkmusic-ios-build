import type { NativeStackNavigationOptions } from 'expo-router'
import { ThemeColors } from './tokens'

export const getStackScreenWithSearchBar = (
	colors: ThemeColors,
): NativeStackNavigationOptions => ({
	headerLargeTitle: true,
	// 导航栏（大标题 + 搜索栏）透明：否则会在页面上多叠一层半透明白，和壁纸出现色差
	headerTransparent: true,
	headerStyle: {
		backgroundColor: 'transparent',
	},
	headerLargeStyle: {
		backgroundColor: 'transparent',
	},
	headerLargeTitleStyle: {
		color: colors.text,
	},
	headerTintColor: colors.text,
	headerShadowVisible: false,
})
