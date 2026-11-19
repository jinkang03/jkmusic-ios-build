import React, { useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { macFont, macPalette, macRadius, macSpace } from '@/constants/macTokens'
import { useAppTheme } from '@/hooks/useAppTheme'
import { tr } from '@/utils/i18n'

const SettingSelect = ({
	value, options, onChange,
}: {
	value: string
	options: Array<{ value: string, label: string }>
	onChange: (v: string) => void
}) => {
	const { isDark } = useAppTheme()
	const c = macPalette(!!isDark)
	const [open, setOpen] = useState(false)
	const current = options.find(o => o.value === value)?.label ?? value ?? tr('未设置', 'Not set')

	return (
		<>
			<Pressable onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
				<Text style={{ color: c.textMuted, fontSize: macFont.body }}>{current}</Text>
				<Text style={{ color: c.textMuted, fontSize: macFont.body }}>›</Text>
			</Pressable>
			<Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
				<Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: macSpace.pageX }} onPress={() => setOpen(false)}>
					<View style={{ backgroundColor: c.bg, borderRadius: macRadius.card, paddingVertical: 8, maxHeight: '70%' }}>
						<ScrollView>
							{options.map(opt => (
								<Pressable
									key={opt.value}
									onPress={() => { onChange(opt.value); setOpen(false) }}
									style={{ paddingHorizontal: 16, paddingVertical: 12 }}
								>
									<Text style={{ color: opt.value === value ? c.primary : c.text, fontSize: macFont.body }}>{opt.label}</Text>
								</Pressable>
							))}
						</ScrollView>
					</View>
				</Pressable>
			</Modal>
		</>
	)
}

export default SettingSelect
