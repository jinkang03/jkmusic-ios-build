/**
 * 液态玻璃（Liquid Glass）视觉令牌。
 *
 * 统一控制：填充透明度、描边、高光、阴影。
 * 全局透明度可在 设置 → 基本设置 → 玻璃透明度 调整（默认 0.55）。
 */
import PersistStatus from '@/store/PersistStatus'
import { GlobalState } from '@/utils/stateMapper'

const DEFAULT_ALPHA = 0.1
const MIN_ALPHA = 0
const MAX_ALPHA = 1

const clamp = (v: number) => Math.min(MAX_ALPHA, Math.max(MIN_ALPHA, v))

const stored = Number((() => {
	try { return PersistStatus.get('app.glassAlpha' as any) } catch { return DEFAULT_ALPHA }
})() ?? DEFAULT_ALPHA)

export const glassAlphaStore = new GlobalState<number>(
	Number.isFinite(stored) ? clamp(stored) : DEFAULT_ALPHA,
)

export const setGlassAlpha = (value: number) => {
	const next = clamp(Number(value) || DEFAULT_ALPHA)
	glassAlphaStore.setValue(next)
	try { PersistStatus.set('app.glassAlpha' as any, next) } catch { /* ignore */ }
}

export type GlassTokens = {
	fill: string
	fillStrong: string
	stroke: string
	highlight: string
	shadow: string
	/** 选中项的圆形底（强调色低透明度） */
	accentFill: (accent: string) => string
}

export const glass = (isDark: boolean, alphaOverride?: number): GlassTokens => {
	const a = clamp(Number(alphaOverride ?? glassAlphaStore.getValue()) || DEFAULT_ALPHA)
	const strong = clamp(a + 0.15)
	// 描边/高光也跟随透明度：否则滑块调到 0 时仍有一条固定的白边/白色高光，
	// 看起来像「盖了一层白遮罩」，永远不够透
	const strokeAlpha = Math.min(1, a * 1.1)
	return {
		// 填充始终是白色：滑块拉满 = 纯白不透明（用户要求），越透越接近壁纸
		fill: isDark ? `rgba(30,30,32,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`,
		fillStrong: isDark ? `rgba(30,30,32,${strong.toFixed(3)})` : `rgba(255,255,255,${strong.toFixed(3)})`,
		stroke: `rgba(255,255,255,${strokeAlpha.toFixed(3)})`,
		highlight: isDark ? `rgba(255,255,255,${(a * 0.12).toFixed(3)})` : `rgba(255,255,255,${(a * 0.9).toFixed(3)})`,
		shadow: 'rgba(0,0,0,0.18)',
		accentFill: (accent: string) => `${accent}24`,
	}
}

/** 卡片阴影（iOS shadow + Android elevation 不用，靠模糊底） */
export const glassShadow = {
	shadowColor: '#000',
	shadowOpacity: 0.16,
	shadowRadius: 18,
	shadowOffset: { width: 0, height: 8 },
} as const

export default { glassAlphaStore, setGlassAlpha, glass, glassShadow }
