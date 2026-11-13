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


if (typeof g.atob === 'undefined') {
	g.atob = (input: string) => NodeBuffer.from(String(input), 'base64').toString('binary')
}

if (typeof g.btoa === 'undefined') {
	g.btoa = (input: string) => NodeBuffer.from(String(input), 'binary').toString('base64')
}

if (!g.crypto) {
	g.crypto = {}
}

if (typeof g.crypto.getRandomValues !== 'function') {
	g.crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
		if (!array) return array
		const view = new Uint8Array((array as any).buffer ?? array, (array as any).byteOffset ?? 0, (array as any).byteLength ?? 0)
		for (let i = 0; i < view.length; i++) view[i] = Math.floor(Math.random() * 256)
		return array
	}
}

if (!g.global) {
	g.global = g
}

export {}

// 启动期 JS 致命错误捕获：把错误打到原生日志，便于在设备/模拟器控制台定位
try {
	const ErrorUtils = (g as any).ErrorUtils
	if (ErrorUtils && typeof ErrorUtils.setGlobalHandler === 'function') {
		const prev = typeof ErrorUtils.getGlobalHandler === 'function' ? ErrorUtils.getGlobalHandler() : null
		ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
			try {
				console.error('[JKMUSIC_FATAL]', isFatal ? 'fatal' : 'soft', error?.message, '\n', error?.stack)
			} catch (_) {
				// ignore
			}
			if (prev) prev(error, isFatal)
		})
	}
} catch (_) {
	// ignore
}
