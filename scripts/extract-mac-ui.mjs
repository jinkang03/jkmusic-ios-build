/**
 * 从已安装的桌面版 JKMUSIC.app 里，把 renderer 的原始源码（.vue / .ts / .js / .svg）还原出来。
 *
 * 原理：app.asar 里的 dist/renderer.js.map 带 sourcesContent，
 * 也就是打包前的完整源码（117 个 .vue + 142 个 .ts）。不需要移动硬盘里的源码仓库。
 *
 * 用法：
 *   node scripts/extract-mac-ui.mjs [输出目录，默认 references/mac-ui]
 *   node scripts/extract-mac-ui.mjs --asar /path/to/app.asar
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const asarIndex = args.indexOf('--asar')
const asarPath = asarIndex >= 0 ? args[asarIndex + 1] : '/Users/jinkang/Documents/JKMUSIC.app/Contents/Resources/app.asar'
const outIndex = args.findIndex((a, i) => !a.startsWith('--') && (i === 0 || args[i - 1] !== '--asar'))
const outDir = path.resolve(outIndex >= 0 ? args[outIndex] : 'references/mac-ui')

if (!fs.existsSync(asarPath)) {
  console.error(`[extract-mac-ui] 找不到 asar: ${asarPath}`)
  process.exit(1)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jk-asar-'))
const mapPath = path.join(tmp, 'renderer.js.map')
execFileSync('npx', ['--yes', 'asar', 'extract-file', asarPath, 'dist/renderer.js.map'], { cwd: tmp, stdio: 'ignore' })
const candidate = fs.existsSync(mapPath) ? mapPath : path.join(tmp, 'dist', 'renderer.js.map')
if (!fs.existsSync(candidate)) {
  console.error('[extract-mac-ui] 解包失败：找不到 renderer.js.map')
  process.exit(1)
}

const map = JSON.parse(fs.readFileSync(candidate, 'utf8'))
let written = 0
const kinds = {}
const styleIndex = []
const vueList = []
map.sources.forEach((source, index) => {
  const content = map.sourcesContent?.[index]
  if (typeof content !== 'string') return
  const rel = source.replace(/^webpack:\/\/[^/]+\/\.\//, '')
  if (!rel.startsWith('src/')) return
  const clean = rel.replace(/^src\//, '')

  // webpack 把每个 .vue 拆成多份：X.vue（可能是原始 SFC，也可能是加载器壳）、
  // X.vue?<hash>（script / 编译后 template / style）。按内容判断类型再落盘，避免丢信息。
  const hashed = /^(.*\.vue)\?([0-9a-f]+)$/.exec(clean)
  if (hashed) {
    const [, vuePath, hash] = hashed
    let kind = 'part'
    let ext = '.txt'
    if (content.startsWith('// extracted by mini-css-extract-plugin')) {
      kind = 'cssmodules' // 仅 CSS Modules 的类名映射，无样式正文，跳过
      return
    }
    if (/_createElementVNode|_openBlock|createElementBlock/.test(content)) {
      kind = 'template'
      ext = '.js'
    } else if (/<template>|<script|export default|import \{/.test(content)) {
      kind = 'script'
      ext = content.includes('lang="less"') || /^\s*[.#][\w-]+\s*\{/m.test(content) ? '.less' : '.ts'
    } else if (/\{[\s\S]*:[\s\S]*\}/.test(content) && content.length < 4000) {
      kind = 'style'
      ext = '.css'
    }
    const target = path.join(outDir, '_parts', `${vuePath}.${hash}.${kind}${ext}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    styleIndex.push({ vuePath, file: path.relative(outDir, target) })
    written += 1
    kinds[`part:${kind}`] = (kinds[`part:${kind}`] ?? 0) + 1
    return
  }

  const target = path.join(outDir, clean)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
  written += 1
  if (clean.endsWith('.vue')) vueList.push(clean)
  const ext = path.extname(clean) || '(none)'
  kinds[ext] = (kinds[ext] ?? 0) + 1
})

// 生成索引：页面 → 组件 → 样式文件
const byVue = new Map()
for (const { vuePath, file } of styleIndex) {
  if (!byVue.has(vuePath)) byVue.set(vuePath, [])
  byVue.get(vuePath).push(file)
}
const indexLines = [
  '# 桌面版 JKMUSIC UI 源码还原索引',
  '',
  `来源：${asarPath} 的 dist/renderer.js.map（source map 里的 sourcesContent）`,
  `生成：node scripts/extract-mac-ui.mjs`,
  '',
  `- .vue 组件：${vueList.length} 个`,
  `- 配套样式：${styleIndex.length} 个（在 _styles/ 下）`,
  '',
  '## 页面（views）',
  '',
]
for (const vue of vueList.filter(v => v.includes('/views/')).sort()) {
  indexLines.push(`- ${vue}`)
  for (const style of byVue.get(vue) ?? []) indexLines.push(`  - 样式：${style}`)
}
indexLines.push('', '## 全部组件（含样式文件）', '')
for (const vue of vueList.filter(v => !v.includes('/views/')).sort()) {
  indexLines.push(`- ${vue}`)
  for (const style of byVue.get(vue) ?? []) indexLines.push(`  - 样式：${style}`)
}
fs.writeFileSync(path.join(outDir, 'INDEX.md'), indexLines.join('\n'))

fs.rmSync(tmp, { recursive: true, force: true })

console.log(`[extract-mac-ui] 已写出 ${written} 个文件 → ${outDir}`)
console.log(`[extract-mac-ui] 类型分布: ${JSON.stringify(kinds)}`)
console.log('[extract-mac-ui] 建议先看: renderer/App.vue, renderer/components/base/MusicList.vue, renderer/views/*, renderer/assets/styles/*')
