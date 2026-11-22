import type { NativeStackNavigationOptions } from 'expo-router'
import { ThemeColors } from './tokens'
import { getTextColor, isWallpaperOn } from '@/jk/themeStore'

export const getStackScreenWithSearchBar = (
	colors: ThemeColors,
): NativeStackNavigationOptions => {
	// 原生 header 的标题/返回按钮：
	//   1) 用户设了「文字颜色」→ 用设置值；
	//   2) 开了壁纸 → 默认白字（与页面正文一致）；
	//   3) 否则跟随主题。
	const headerText = getTextColor() || '#FFFFFF'
	return {
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
			color: headerText,
		},
		headerTitleStyle: {
			color: headerText,
		},
		headerTintColor: headerText,
		headerShadowVisible: false,
	}
}

export default { getStackScreenWithSearchBar }
