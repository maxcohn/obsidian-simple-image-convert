import { describe, expect, it } from 'vitest';
import { isAnimated } from '../formats';
import { webpEncoder } from './webp';

/** A noisy RGBA image, so quality has a visible effect on size. */
function image(width: number, height: number, alpha = 255): ImageData {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i++) {
		data[i] = i % 4 === 3 ? alpha : (i * 7919) % 256;
	}
	// Node has no ImageData constructor.
	return { data, width, height, colorSpace: 'srgb' };
}

async function encode(input: ImageData, quality = 75): Promise<Uint8Array> {
	return new Uint8Array(await webpEncoder.encode(input, quality));
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

describe('webpEncoder', () => {
	it('produces a still WebP file', async () => {
		const output = await encode(image(16, 16));

		expect(ascii(output, 0, 4)).toBe('RIFF');
		expect(ascii(output, 8, 4)).toBe('WEBP');
		expect(isAnimated(output, 'image/webp')).toBe(false);
	});

	it('keeps the image dimensions', async () => {
		const output = await encode(image(48, 32));

		// A lossy bitstream: "VP8 " chunk header, frame tag, start code, then 14-bit sizes.
		expect(ascii(output, 12, 4)).toBe('VP8 ');
		const view = new DataView(output.buffer, output.byteOffset);
		expect(view.getUint16(26, true) & 0x3fff).toBe(48);
		expect(view.getUint16(28, true) & 0x3fff).toBe(32);
	});

	it('keeps transparency', async () => {
		const output = await encode(image(16, 16, 128));

		// Alpha needs the extended format, whose flags byte has an alpha bit.
		expect(ascii(output, 12, 4)).toBe('VP8X');
		expect((output[20] ?? 0) & 0x10).not.toBe(0);
	});

	it('produces smaller files at lower quality', async () => {
		const input = image(64, 64);

		const low = await encode(input, 10);
		const high = await encode(input, 90);

		expect(low.byteLength).toBeLessThan(high.byteLength);
	});
});
