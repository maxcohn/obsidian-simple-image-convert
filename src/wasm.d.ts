// esbuild's binary loader inlines .wasm files as bytes (see esbuild.config.mjs).
declare module '*.wasm' {
	const bytes: Uint8Array<ArrayBuffer>;
	export default bytes;
}
