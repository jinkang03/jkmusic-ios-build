/** 设置项一行：左名称（可带副标题），右控件 */
import React from 'react'
import { Text, View } from 'react-native'
import { macFont, macPalette, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'

const SettingRow = ({ label, hint, disabled, children }: { label: string, hint?: string, disabled?: boolean, children?: React.ReactNode }) => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	return (
		<View style={{
			flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
			paddingHorizontal: macSpace.pageX, minHeight: 52, gap: 12,
			borderBottomWidth: 0,
			opacity: disabled ? 0.45 : 1,
		}}>
			<View style={{ flex: 1 }}>
				<Text style={{ color: c.text, fontSize: macFont.body }}>{label}</Text>
				{hint ? <Text style={{ color: c.textMuted, fontSize: macFont.badge, marginTop: 2 }}>{hint}</Text> : null}
			</View>
			{children}
		</View>
	)
}

export default SettingRow
