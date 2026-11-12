/**
 * 请求层：对齐 JKMUSIC 桌面版 src/renderer/utils/request.js 的契约，
 * 把 needle/Node 换成 fetch + pako，供 musicSdk 全部内置源使用。
 *
 * 对外暴露：http / httpGet / httpPost / httpFetch / http_jsonp / cancelHttp / checkUrl
 */
import { Buffer } from 'buffer'
import pako from 'pako'
import { debugRequest } from './env'
import { requestMsg } from './message'
import { bHh } from './musicSdk/options'

/** 桌面版取 process.versions.app；RN 固定为应用版本 */
const APP_VERSION = '2.12.6'

const defaultHeaders = {
  'User-Agent': 'lx-music mobile request',
}

const handleDeflateRaw = (data) => pako.deflateRaw(data)

const regx = /(?:\d\w)+/g

/**
 * 计算桌面版专用的签名头（kw/kg 等接口需要）。
 */
const buildSignHeaders = async(url, rawHeaders) => {
  const headers = { ...rawHeaders }
  if (!headers[bHh]) return headers

  const path = url.replace(/^https?:\/\/[\w.:]+\//, '/')
  let s = Buffer.from(bHh, 'hex').toString()
  s = s.replace(s.substr(-1), '')
  s = Buffer.from(s, 'base64').toString()

  const versionParts = APP_VERSION.split('-')
  const v = versionParts[0].split('.').map(n => (n.length < 3 ? n.padStart(3, '0') : n)).join('')
  const v2 = versionParts[1] || ''
  if (s) {
    const payload = Buffer.from(
      JSON.stringify(`${path}${v}`.match(regx), null, 1).concat(v),
    ).toString('base64')
    const signature = Buffer.from(handleDeflateRaw(Buffer.from(payload))).toString('hex')
    headers[s] = `${signature}&${parseInt(v)}${v2}`
  }
  delete headers[bHh]
  return headers
}

const buildBody = (data, options) => {
  if (data == null) return undefined
  if (options.form) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(data)) params.append(key, String(value))
    return params.toString()
  }
  if (options.formData) {
    const form = new FormData()
    for (const [key, value] of Object.entries(data)) form.append(key, value)
    return form
  }
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) return data
  if (options.json === false) return data
  return JSON.stringify(data)
}

const parseBody = (text, format) => {
  if (format === 'json') {
    try {
      return JSON.parse(text)
    } catch (_) {
      return text
    }
  }
  return text
}

const toRawBuffer = (text) => {
  const bytes = new TextEncoder().encode(text)
  const buf = Buffer.alloc(bytes.length)
  Buffer.from(bytes).copy(buf)
  return buf
}

/**
 * 真正发请求
 */
const fetchData = async(url, method, rawOptions, callback) => {
  const {
    headers = {},
    format = 'json',
    timeout = 15000,
    body,
    form,
    formData,
    ...options
  } = rawOptions ?? {}

  const controller = new AbortController()
  let timer = null
  const requestObj = {
    abort: () => controller.abort(),
    aborted: false,
  }

  debugRequest && console.log(`\n---send request------${url}`)

  try {
    const finalHeaders = await buildSignHeaders(url, { ...defaultHeaders, ...headers })
    const data = buildBody(body ?? form ?? formData, { form, formData, json: options.json })

    timer = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: (method || 'get').toUpperCase(),
      headers: finalHeaders,
      body: data,
      signal: controller.signal,
    })

    const text = await response.text()
    const parsed = parseBody(text, format)

    const resp = {
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: Object.fromEntries(response.headers.entries?.() ?? []),
      bytes: text.length,
      body: parsed,
      raw: toRawBuffer(text),
    }
    callback(null, resp, parsed)
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'Aborted' : err?.message
    callback(Object.assign(new Error(message || 'request failed'), { code: err?.code }), null, null)
  } finally {
    if (timer) clearTimeout(timer)
  }

  return requestObj
}

/**
 * promise 形式的请求方法
 */
const buildHttpPromise = (url, options) => {
  const obj = {
    isCancelled: false,
    cancelHttp: () => {
      obj.isCancelled = true
      if (obj.requestObj) obj.requestObj.abort()
    },
  }

  obj.promise = new Promise((resolve, reject) => {
    void fetchData(url, options.method || 'get', options, (err, resp) => {
      obj.cancelFn = null
      if (err) {
        reject(err)
        return
      }
      resolve(resp)
    }).then((requestObj) => {
      obj.requestObj = requestObj
      if (obj.isCancelled) obj.cancelHttp()
    }).catch(reject)
  })

  return obj
}

export const httpFetch = (url, options = {}) => {
  const requestObj = buildHttpPromise(url, options)
  requestObj.promise = requestObj.promise.catch(err => {
    switch (err?.message) {
      case 'socket hang up':
      case 'Network request failed':
        return Promise.reject(new Error(requestMsg.notConnectNetwork))
      case 'ETIMEDOUT':
      case 'ESOCKETTIMEDOUT':
      case 'Aborted':
      case 'timeout':
        return Promise.reject(new Error(requestMsg.timeout))
      case 'ENOTFOUND':
        return Promise.reject(new Error(requestMsg.notConnectNetwork))
      default:
        return Promise.reject(err)
    }
  })
  return requestObj
}

export const cancelHttp = (requestObj) => {
  if (!requestObj) return
  requestObj.abort?.()
  requestObj.cancelHttp?.()
}

export const http = (url, options, cb) => {
  if (typeof options === 'function') {
    cb = options
    options = {}
  }
  const opts = options ?? {}
  return fetchData(url, opts.method || 'get', opts, cb)
}

export const httpGet = (url, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  return fetchData(url, 'get', options ?? {}, callback)
}

export const httpPost = (url, data, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  return fetchData(url, 'post', { ...(options ?? {}), body: data }, callback)
}

export const http_jsonp = (url, options, callback) => {
  // RN 无 script 注入能力，JSONP 统一按普通 GET 处理
  return httpGet(url, options, callback)
}

export const checkUrl = (url, options = {}) => new Promise((resolve, reject) => {
  fetchData(url, 'head', options, (err, resp) => {
    if (err) {
      reject(err)
      return
    }
    if (resp.statusCode === 200) resolve()
    else reject(new Error(String(resp.statusCode)))
  }).catch(reject)
})

export default { http, httpGet, httpPost, httpFetch, http_jsonp, cancelHttp, checkUrl }
