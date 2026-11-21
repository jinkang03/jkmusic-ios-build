/**
 * 音源显示名（中英双语）。
 *
 * 与桌面版 `common.sourceNameType` 对齐：
 *   - alias（默认）→ 中文/英文全名「酷我音乐 / Kuwo Music」
 *   - real        → 平台代号「kw / kg / tx / wy / mg」
 * 桌面版用语言包前缀 `source_alias_` / `source_` 区分，这里用同一份映射表实现。
 */
import { getSetting } from '@/jk/settingsStore'
import { tr } from '@/utils/i18n'

const SOURCE_NAMES: Record<string, { zh: string, en: string, shortZh: string, shortEn: string }> = {
	kw: { zh: '酷我音乐', en: 'Kuwo Music', shortZh: '酷我', shortEn: 'Kuwo' },
	kg: { zh: '酷狗音乐', en: 'Kugou Music', shortZh: '酷狗', shortEn: 'Kugou' },
	tx: { zh: '企鹅音乐', en: 'QQ Music', shortZh: '企鹅', shortEn: 'QQ' },
	wy: { zh: '网易音乐', en: 'NetEase Music', shortZh: '网易', shortEn: 'NetEase' },
	mg: { zh: '咪咕音乐', en: 'Migu Music', shortZh: '咪咕', shortEn: 'Migu' },
}

/**
 * @param short    胶囊/角标用的短名（酷我 / Kuwo）
 * @param nameType 覆盖设置值（组件里用 useSetting 传入，保证改设置后立刻刷新）
 */
export const sourceLabel = (source: string, short = false, nameType?: 'alias' | 'real') => {
	const type = nameType ?? (getSetting<'alias' | 'real'>('common.sourceNameType', 'alias') === 'real' ? 'real' : 'alias')
	// 真实名：桌面版显示平台代号本身（source_kw → kw）
	if (type === 'real') return source
	const item = SOURCE_NAMES[source]
	if (!item) return source
	return short ? tr(item.shortZh, item.shortEn) : tr(item.zh, item.en)
}

export default sourceLabel
