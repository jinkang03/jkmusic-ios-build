/**
 * 统一状态视图：加载 / 空 / 错误。
 * 所有页面复用，避免每页各写一套。
 */
import React from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { macFont, macSpace, macPalette } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { tr } from '@/utils/i18n'

type Mode = 'loading' | 'empty' | 'error'

/** 文案在渲染期生成：模块级常量会在语言切换后过期 */
const defaultText = (mode: Mode) => mode === 'loading'
	? tr('加载中…', 'Loading…')
	: mode === 'empty' ? tr('暂无内容', 'Nothing here') : tr('出错了', 'Something went wrong')

const StateView = ({
	mode,
	title,
	hint,
	onRetry,
}: {
	mode: Mode
	title?: string
	hint?: string
	onRetry?: () => void
}) => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	return (
		<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: macSpace.pageX, paddingVertical: 48 }}>
			{mode === 'loading' ? <ActivityIndicator color={c.primary} /> : null}
			<Text style={{ color: mode === 'error' ? c.danger : c.text, fontSize: macFont.body, marginTop: mode === 'loading' ? 12 : 0 }}>
				{title ?? defaultText(mode)}
			</Text>
			{hint ? (
				<Text style={{ color: c.textMuted, fontSize: macFont.caption, marginTop: 6, textAlign: 'center' }}>
					{hint}
				</Text>
			) : null}
			{onRetry && mode === 'error' ? (
				<Text onPress={onRetry} style={{ color: c.primary, fontSize: macFont.body, marginTop: 14 }}>
					{tr('重试', 'Retry')}
				</Text>
			) : null}
		</View>
	)
}

export default StateView
