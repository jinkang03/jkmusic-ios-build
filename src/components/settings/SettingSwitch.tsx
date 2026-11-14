import React from 'react'
import { Switch } from 'react-native'
import { macPalette } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'

const SettingSwitch = ({ value, onChange }: { value: boolean, onChange: (v: boolean) => void }) => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	return (
		<Switch
			value={!!value}
			onValueChange={onChange}
			trackColor={{ false: c.fillMuted, true: c.primary }}
			thumbColor="#fff"
		/>
	)
}

export default SettingSwitch
