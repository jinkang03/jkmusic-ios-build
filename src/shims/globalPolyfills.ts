/**
 * 全局兼容垫片：必须在任何业务模块之前执行。
 *
 * JKMUSIC 的 musicSdk 移植自桌面版，模块顶层直接使用全局 Buffer
 * （例如 kw/util.js 的 `const buf_key = Buffer.from('yeelion')`）。
 * React Native 没有全局 Buffer / TextEncoder / TextDecoder，
 * 缺失会在 import 阶段抛错并触发 RN 的 JS fatal（表现为启动闪退）。
 */
import { Buffer as NodeBuffer } from 'buffer'

const g: any = globalThis

if (!g.Buffer) {
	g.Buffer = NodeBuffer
}

if (typeof g.TextEncoder === 'undefined') {
	g.TextEncoder = class TextEncoderPolyfill {
		get encoding() {
			return 'utf-8'
		}

		encode(input: string = '') {
			const buf = NodeBuffer.from(String(input), 'utf8')
			return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
		}
	}
}

if (typeof g.TextDecoder === 'undefined') {
	g.TextDecoder = class TextDecoderPolyfill {
		get encoding() {
			return 'utf-8'
		}

		decode(input?: any) {
			if (!input) return ''
			if (typeof input === 'string') return input
			return NodeBuffer.from(input).toString('utf8')
		}
	}
}

if (!g.process) {
	g.process = {
		env: { NODE_ENV: 'production' },
		platform: 'ios',
		browser: false,
		versions: { node: '', app: '1.0.0' },
		nextTick: (fn: (...args: any[]) => void, ...args: any[]) => setTimeout(() => fn(...args), 0),
	}
}

if (!g.global) {
	g.global = g
}

export {}
