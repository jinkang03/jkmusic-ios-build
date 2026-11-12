/**
 * crypto 兼容层：用 crypto-js 实现 musicSdk 需要的
 * createCipheriv / createDecipheriv / createHash / randomBytes。
 */
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

export const publicEncrypt = () => {
  throw new Error('publicEncrypt 由原生 Crypto 模块提供')
}
export const privateDecrypt = () => {
  throw new Error('privateDecrypt 由原生 Crypto 模块提供')
}

export default { createCipheriv, createDecipheriv, createHash, randomBytes, publicEncrypt, privateDecrypt, constants }
