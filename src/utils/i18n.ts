import en from '@/locales/en.json'
import zh from '@/locales/zh.json'
import PersistStatus from '@/store/PersistStatus'
import { getLocales } from 'expo-localization'
import { I18n } from 'i18n-js'
import { GlobalState } from './stateMapper'

const translations = {
	en,
	zh,
}

const i18n = new I18n(translations)

i18n.enableFallback = true
export const nowLanguage = new GlobalState<string>('zh')

export const setI18nConfig = () => {
	const languageCode = PersistStatus.get('app.language') || getLocales()[0].languageCode || 'zh'
	nowLanguage.setValue(languageCode)
	i18n.locale = languageCode
}

export const changeLanguage = (languageCode: string) => {
	PersistStatus.set('app.language', languageCode)
	i18n.locale = languageCode
	nowLanguage.setValue(languageCode)
}

/**
 * 轻量双语助手：把中英文写在一起，避免为每个界面标签维护 key 表。
 * 语言切换会整体重挂载（Stack key），所以渲染期调用即可即时生效。
 */
export const tr = (zh: string, en: string) => (i18n.locale === 'en' ? en : zh)

export default i18n
