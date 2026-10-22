import { describe, expect, it } from 'vitest';
import { inputMimeType, isAnimated } from './formats';

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const uint32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/** A 1x1 GIF with a global color table and the given number of frames. */
function gif(frameCount: number, { loopExtension = false } = {}): Uint8Array {
	const header = [...ascii('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255];
	const loop = [0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0];
	const frame = [
		// Graphic control extension.
		0x21, 0xf9, 4, 0, 0, 0, 0, 0,
		// Image descriptor, LZW minimum code size, one data sub-block, terminator.
		0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0,
	];
	const frames = Array.from({ length: frameCount }, () => frame).flat();
	return Uint8Array.from([...header, ...(loopExtension ? loop : []), ...frames, 0x3b]);
}

function webp(chunk: string, flags = 0): Uint8Array {
	return Uint8Array.from([
		...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(chunk), 10, 0, 0, 0, flags, 0, 0, 0,
	]);
}

function avif(majorBrand: string, compatibleBrands: string[]): Uint8Array {
	const body = [
		...ascii('ftyp'), ...ascii(majorBrand), 0, 0, 0, 0, ...compatibleBrands.flatMap(ascii),
	];
	return Uint8Array.from([...uint32(body.length + 4), ...body, ...uint32(8), ...ascii('meta')]);
}

describe('inputMimeType', () => {
	it('maps supported extensions case-insensitively', () => {
		expect(inputMimeType('jpg')).toBe('image/jpeg');
		expect(inputMimeType('JPEG')).toBe('image/jpeg');
		expect(inputMimeType('Png')).toBe('image/png');
	});

	it('rejects unsupported extensions', () => {
		expect(inputMimeType('heic')).toBeUndefined();
		expect(inputMimeType('md')).toBeUndefined();
		expect(inputMimeType('constructor')).toBeUndefined();
	});
});

describe('isAnimated', () => {
	it('detects multi-frame GIFs', () => {
		expect(isAnimated(gif(1), 'image/gif')).toBe(false);
		expect(isAnimated(gif(1, { loopExtension: true }), 'image/gif')).toBe(false);
		expect(isAnimated(gif(2), 'image/gif')).toBe(true);
		expect(isAnimated(gif(3, { loopExtension: true }), 'image/gif')).toBe(true);
	});

	it('detects the WebP animation flag', () => {
		expect(isAnimated(webp('VP8 '), 'image/webp')).toBe(false);
		expect(isAnimated(webp('VP8X', 0x10), 'image/webp')).toBe(false);
		expect(isAnimated(webp('VP8X', 0x12), 'image/webp')).toBe(true);
	});

	it('detects AVIF image sequences', () => {
		expect(isAnimated(avif('avif', ['mif1', 'miaf']), 'image/avif')).toBe(false);
		expect(isAnimated(avif('avis', ['avif', 'msf1']), 'image/avif')).toBe(true);
		expect(isAnimated(avif('avif', ['mif1', 'avis']), 'image/avif')).toBe(true);
	});

	it('treats truncated or other data as still', () => {
		expect(isAnimated(Uint8Array.from([0x47, 0x49]), 'image/gif')).toBe(false);
		expect(isAnimated(new Uint8Array(0), 'image/webp')).toBe(false);
		expect(isAnimated(new Uint8Array(4), 'image/avif')).toBe(false);
		expect(isAnimated(gif(2), 'image/png')).toBe(false);
	});
});
