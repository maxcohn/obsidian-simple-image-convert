import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		{
			// Matches esbuild's binary loader (see esbuild.config.mjs), which inlines .wasm files as bytes.
			name: 'wasm-binary',
			enforce: 'pre',
			load(id: string) {
				if (!id.endsWith('.wasm')) return null;
				return (
					`import { readFileSync } from 'node:fs';\n` +
					`export default new Uint8Array(readFileSync(${JSON.stringify(id)}));`
				);
			},
		},
	],
	// Dependencies normally skip plugins and load in Node directly, which would bypass the loader above.
	test: { server: { deps: { inline: [/\.wasm$/] } } },
});
