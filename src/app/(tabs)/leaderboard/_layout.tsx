import { Stack } from 'expo-router'
import React from 'react'
import { useAppTheme } from '@/hooks/useAppTheme'
import i18n from '@/utils/i18n'

const LeaderboardLayout = () => {
	const { colors } = useAppTheme()
	return (
		<Stack
			screenOptions={{
				headerStyle: { backgroundColor: colors.background },
				headerTintColor: colors.text,
				headerShadowVisible: false,
			}}
		>
			<Stack.Screen name="index" options={{ title: i18n.t('appTab.radio') }} />
			<Stack.Screen name="[id]" options={{ title: '' }} />
		</Stack>
	)
}

export default LeaderboardLayout
