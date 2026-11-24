/**
 * 设置分区清单（设置首页与分区页共用一份，避免两处标题走样）。
 * 标题在渲染期翻译，所以语言切换后立即生效。
 */
import { tr } from '@/utils/i18n'

export type SettingsSectionDef = {
	id: string
	zh: string
	en: string
	/** 桌面版专属：iOS 上只保存配置，不生效 */
	desktopOnly?: boolean
	/** 分区页顶部的说明（桌面专属项用来说明「为什么不生效」） */
	noteZh?: string
	noteEn?: string
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
	{ id: 'basic', zh: '基本设置', en: 'Basic' },
	{ id: 'player', zh: '播放设置', en: 'Playback' },
	{ id: 'soundEffect', zh: '音效', en: 'Sound Effects' },
	{ id: 'detail', zh: '播放详情页设置', en: 'Now Playing Page' },
	{ id: 'search', zh: '搜索设置', en: 'Search' },
	{ id: 'list', zh: '列表设置', en: 'Lists' },
	{ id: 'download', zh: '下载设置', en: 'Downloads' },
	{ id: 'backup', zh: '备份与恢复', en: 'Backup & Restore' },
	{ id: 'other', zh: '其他', en: 'Other' },
]

export const getSectionDef = (id: string) => SETTINGS_SECTIONS.find(section => section.id === id)

export const getSectionTitle = (id: string) => {
	const def = getSectionDef(id)
	return def ? tr(def.zh, def.en) : id
}

export const getSectionNote = (id: string) => {
	const def = getSectionDef(id)
	return def?.noteZh ? tr(def.noteZh, def.noteEn as string) : ''
}
