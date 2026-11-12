// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro loads this config as CommonJS.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// JKMUSIC musicSdk 需要 Node 的 crypto / zlib，这里映射到 RN 兼容实现
const shims = path.join(__dirname, 'src', 'shims')

config.resolver.extraNodeModules = {
	...(config.resolver.extraNodeModules ?? {}),
	crypto: path.join(shims, 'crypto.js'),
	zlib: path.join(shims, 'zlib.js'),
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName === 'node:crypto') moduleName = 'crypto'
	if (moduleName === 'node:zlib') moduleName = 'zlib'

	if (moduleName === 'axios' && (platform === 'ios' || platform === 'android')) {
		// Keep the shared browser/XHR entry for native import and require callers.
		return context.resolveRequest(
			{ ...context, unstable_enablePackageExports: false },
			moduleName,
			platform,
		)
	}

	return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
