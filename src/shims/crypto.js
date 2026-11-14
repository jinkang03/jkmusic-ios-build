/**
 * crypto 兼容层：用 crypto-js 实现 musicSdk 需要的
 * createCipheriv / createDecipheriv / createHash / randomBytes。
 */
import { Buffer } from 'buffer'
import CryptoJS from 'crypto-js'

export const constants = {
  RSA_NO_PADDING: 3,
  RSA_PKCS1_PADDING: 1,
  RSA_PKCS1_OAEP_PADDING: 4,
}

const toWordArray = (data) => {
  if (data == null) return CryptoJS.lib.WordArray.create([])
  if (typeof data === 'string') return CryptoJS.enc.Utf8.parse(data)
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    let hex = ''
    for (const b of bytes) hex += b.toString(16).padStart(2, '0')
    return CryptoJS.enc.Hex.parse(hex)
  }
  if (Array.isArray(data)) return toWordArray(Uint8Array.from(data))
  return data
}

const toBytes = (wordArray) => {
  const hex = wordArray.toString(CryptoJS.enc.Hex)
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

const algoFor = (mode) => (/des-ede3|3des/i.test(mode) ? CryptoJS.TripleDES : CryptoJS.AES)
const isEcb = (mode) => /ecb/i.test(mode)

const optionsFor = (mode, iv) => {
  const opts = { mode: isEcb(mode) ? CryptoJS.mode.ECB : CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  if (!isEcb(mode) && iv && iv.sigBytes) opts.iv = iv
  return opts
}

class Cipher {
  constructor(mode, key, iv) {
    this.mode = mode
    this.key = toWordArray(key)
    this.iv = toWordArray(iv)
    this.chunks = []
  }
  update(data) {
    this.chunks.push(toWordArray(data))
    return new Uint8Array(0)
  }
  final() {
    const merged = this.chunks.length
      ? this.chunks.reduce((a, b) => a.concat(b))
      : CryptoJS.lib.WordArray.create([])
    const out = algoFor(this.mode).encrypt(merged, this.key, optionsFor(this.mode, this.iv))
    return toBytes(out.ciphertext)
  }
}

class Decipher {
  constructor(mode, key, iv) {
    this.mode = mode
    this.key = toWordArray(key)
    this.iv = toWordArray(iv)
    this.chunks = []
  }
  update(data) {
    this.chunks.push(toWordArray(data))
    return new Uint8Array(0)
  }
  final() {
    const merged = this.chunks.length
      ? this.chunks.reduce((a, b) => a.concat(b))
      : CryptoJS.lib.WordArray.create([])
    const plain = algoFor(this.mode).decrypt({ ciphertext: merged }, this.key, optionsFor(this.mode, this.iv))
    return toBytes(plain)
  }
}

export const createCipheriv = (mode, key, iv) => new Cipher(mode, key, iv)
export const createDecipheriv = (mode, key, iv) => new Decipher(mode, key, iv)

class Hash {
  constructor(algo) {
    this.algo = String(algo).toLowerCase()
    this.data = ''
  }
  update(data) {
    this.data += typeof data === 'string' ? data : new TextDecoder().decode(toBytes(toWordArray(data)))
    return this
  }
  digest(encoding) {
    const out = this.algo === 'md5'
      ? CryptoJS.MD5(this.data)
      : this.algo === 'sha1'
        ? CryptoJS.SHA1(this.data)
        : CryptoJS.SHA256(this.data)
    if (encoding === 'hex') return out.toString(CryptoJS.enc.Hex)
    if (encoding === 'base64') return out.toString(CryptoJS.enc.Base64)
    return toBytes(out)
  }
}

export const createHash = (algo) => new Hash(algo)

export const randomBytes = (size) => {
  const bytes = new Uint8Array(size)
  const g = globalThis.crypto
  if (g && g.getRandomValues) g.getRandomValues(bytes)
  else for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

/* ---------------- 纯 JS RSA（wy 的 weapi 依赖） ---------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const b64ToBytes = (s) => {
  const clean = s.replace(/-----[^-]+-----/g, '').replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4))
  let o = 0, buf = 0, bits = 0
  for (const ch of clean) {
    const v = B64.indexOf(ch)
    if (v < 0) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buf >> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}

const derNode = (b, off) => {
  const tag = b[off]
  let len = b[off + 1]
  let p = off + 2
  if (len & 0x80) {
    const n = len & 0x7f
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + b[p + i]
    p += n
  }
  return { tag, start: p, end: p + len }
}

const bytesToBig = (bytes) => {
  let v = 0n
  for (const b of bytes) v = (v << 8n) | BigInt(b)
  return v
}

const bigToBytes = (v, len) => {
  const out = new Uint8Array(len)
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

const parsePublicKey = (pem) => {
  const der = b64ToBytes(pem)
  const seq = derNode(der, 0)
  const alg = derNode(der, seq.start)
  const bit = derNode(der, alg.end)
  const inner = derNode(der, bit.start + 1) // 跳过 unused-bits 字节
  const nInt = derNode(der, inner.start)
  const eInt = derNode(der, nInt.end)
  const n = bytesToBig(der.subarray(nInt.start, nInt.end))
  const e = bytesToBig(der.subarray(eInt.start, eInt.end))
  return { n, e, k: Math.ceil(n.toString(2).length / 8) }
}

const modPow = (base, exp, mod) => {
  let r = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod
    base = (base * base) % mod
    exp >>= 1n
  }
  return r
}

const keyCache = new Map()
const getKey = (pem) => {
  let k = keyCache.get(pem)
  if (!k) {
    k = parsePublicKey(pem)
    keyCache.set(pem, k)
  }
  return k
}

export const publicEncrypt = ({ key, padding }, data) => {
  const { n, e, k } = getKey(key)
  const msg = data instanceof Uint8Array ? data : new Uint8Array(data)
  let block
  if (padding === constants.RSA_NO_PADDING) {
    if (msg.length > k) throw new Error('data too large for key size')
    block = new Uint8Array(k)
    block.set(msg, k - msg.length)
  } else if (padding === constants.RSA_PKCS1_PADDING) {
    const psLen = k - msg.length - 3
    if (psLen < 8) throw new Error('data too large for key size')
    block = new Uint8Array(k)
    block[0] = 0
    block[1] = 2
    const rnd = randomBytes(psLen)
    for (let i = 0; i < psLen; i++) block[2 + i] = rnd[i] || 1
    block[2 + psLen] = 0
    block.set(msg, 3 + psLen)
  } else {
    throw new Error('unsupported RSA padding: ' + padding)
  }
  return Buffer.from(bigToBytes(modPow(bytesToBig(block), e, n), k))
}

export const privateDecrypt = () => {
  throw new Error('privateDecrypt not supported')
}

export default { createCipheriv, createDecipheriv, createHash, randomBytes, publicEncrypt, privateDecrypt, constants }
