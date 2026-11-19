/**
 * 音源显示名（中英双语）。桌面版文案固定为「酷我音乐 / 酷狗音乐 / 企鹅音乐 / 网易音乐 / 咪咕音乐」。
 */
import { tr } from '@/utils/i18n'

const SOURCE_NAMES: Record<string, { zh: string, en: string, shortZh: string, shortEn: string }> = {
	kw: { zh: '酷我音乐', en: 'Kuwo Music', shortZh: '酷我', shortEn: 'Kuwo' },
	kg: { zh: '酷狗音乐', en: 'Kugou Music', shortZh: '酷狗', shortEn: 'Kugou' },
	tx: { zh: '企鹅音乐', en: 'QQ Music', shortZh: '企鹅', shortEn: 'QQ' },
	wy: { zh: '网易音乐', en: 'NetEase Music', shortZh: '网易', shortEn: 'NetEase' },
	mg: { zh: '咪咕音乐', en: 'Migu Music', shortZh: '咪咕', shortEn: 'Migu' },
}

/** short = 胶囊用的短名（酷我 / Kuwo） */
export const sourceLabel = (source: string, short = false) => {
	const item = SOURCE_NAMES[source]
	if (!item) return source
	return short ? tr(item.shortZh, item.shortEn) : tr(item.zh, item.en)
}

export default sourceLabel
