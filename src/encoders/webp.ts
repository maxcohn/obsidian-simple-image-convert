import webpModuleFactory, { WebPModule } from '@jsquash/webp/codec/enc/webp_enc.js';
import wasmBytes from '@jsquash/webp/codec/enc/webp_enc.wasm';
import { defaultOptions } from '@jsquash/webp/meta.js';
import { initEmscriptenModule } from '@jsquash/webp/utils.js';
import type { ImageEncoder } from './encoder';

// TODO: Switch to native encoding (canvas.toBlob with 'image/webp') and drop the
// bundled WASM if iOS ever supports it. Today iOS silently produces PNG instead.

let modulePromise: Promise<WebPModule> | undefined;

/** Compiles libwebp on first use rather than at plugin load. */
function loadModule(): Promise<WebPModule> {
	modulePromise ??= WebAssembly.compile(wasmBytes).then((wasm) =>
		initEmscriptenModule(webpModuleFactory, wasm, {
			// Without this the glue resolves the .wasm file against import.meta.url,
			// which doesn't exist in Obsidian's CommonJS bundle and throws on mobile.
			// The path is never fetched since the module is already compiled.
			locateFile: (path: string) => path,
		}),
	);
	return modulePromise;
}

export const webpEncoder: ImageEncoder = {
	label: 'WebP',
	extension: 'webp',
	async encode(image, quality) {
		const module = await loadModule();
		const result = module.encode(image.data, image.width, image.height, {
			...defaultOptions,
			quality,
		});
		if (!result) throw new Error('WebP encoding failed.');
		return result.slice().buffer;
	},
};
