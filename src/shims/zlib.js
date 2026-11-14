/**
 * zlib 兼容层：用 pako 实现 Node 的 inflate / deflateRaw。
 * 供 JKMUSIC musicSdk（kw 歌词解密、tx qrc 解码）使用。
 */
import { Buffer } from 'buffer'
import pako from 'pako'

const toU8 = (input) => {
  if (input == null) return new Uint8Array(0)
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (typeof input === 'string') return new TextEncoder().encode(input)
  if (input.buffer) return new Uint8Array(input.buffer, input.byteOffset ?? 0, input.length ?? 0)
  if (Array.isArray(input)) return Uint8Array.from(input)
  return new Uint8Array(0)
}

const wrap = (fn) => (input, options, callback) => {
  let cb = callback
  let opts = options
  if (typeof options === 'function') {
    cb = options
    opts = undefined
  }
  try {
    // 返回 Buffer 而非 Uint8Array：上游代码会调用 out.toString('utf8')，
    // Uint8Array 的 toString 会把字节拼成 "1,2,3"（歌词变数字串就是这个原因）
    const out = Buffer.from(fn(toU8(input), opts))
    if (cb) cb(null, out)
    return out
  } catch (err) {
    if (cb) cb(err, null)
    else throw err
  }
}

export const inflate = wrap((data) => pako.inflate(data))
export const inflateSync = (data) => Buffer.from(pako.inflate(toU8(data)))
export const inflateRaw = wrap((data) => pako.inflateRaw(data))
export const deflate = wrap((data) => pako.deflate(data))
export const deflateRaw = wrap((data) => pako.deflateRaw(data))
export const gzip = wrap((data) => pako.gzip(data))
export const gunzip = wrap((data) => pako.ungzip(data))

export const constants = {
  Z_NO_FLUSH: 0,
  Z_SYNC_FLUSH: 2,
  Z_FINISH: 4,
}

export default { inflate, inflateSync, inflateRaw, deflate, deflateRaw, gzip, gunzip, constants }
