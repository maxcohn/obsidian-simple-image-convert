/**
 * Input formats, keyed by lowercase file extension. Every platform Obsidian
 * runs on decodes these natively, so supporting them costs no bundle size.
 */
const INPUT_MIME_TYPES = new Map<string, string>([
	['jpg', 'image/jpeg'],
	['jpeg', 'image/jpeg'],
	['png', 'image/png'],
	['webp', 'image/webp'],
	['avif', 'image/avif'],
	['gif', 'image/gif'],
]);

/**
 * Returns the MIME type for a supported input extension, or undefined if the
 * extension isn't a supported input. Case-insensitive.
 */
export function inputMimeType(extension: string): string | undefined {
	return INPUT_MIME_TYPES.get(extension.toLowerCase());
}

/**
 * Whether the image has more than one frame. Decoding keeps only the first
 * frame, so animated images are refused rather than silently flattened.
 * Malformed data counts as not animated and is left for the decoder to reject.
 */
export function isAnimated(bytes: Uint8Array, mimeType: string): boolean {
	switch (mimeType) {
		case 'image/gif':
			return isAnimatedGif(bytes);
		case 'image/webp':
			return isAnimatedWebp(bytes);
		case 'image/avif':
			return isAnimatedAvif(bytes);
		default:
			return false;
	}
}

function isAnimatedGif(bytes: Uint8Array): boolean {
	// Header (6 bytes) and logical screen descriptor (7), then an optional global color table.
	let i = 13 + colorTableSize(bytes[10]);
	let frames = 0;
	while (i < bytes.length) {
		const block = bytes[i];
		if (block === 0x2c) {
			// Image descriptor (10 bytes), optional local color table, LZW code size, image data.
			if (++frames > 1) return true;
			i += 10 + colorTableSize(bytes[i + 9]) + 1;
			i = skipGifSubBlocks(bytes, i);
		} else if (block === 0x21) {
			// Extension: introducer, label, then data sub-blocks.
			i = skipGifSubBlocks(bytes, i + 2);
		} else {
			// Trailer (0x3b) or malformed data.
			break;
		}
	}
	return false;
}

/** Size in bytes of the color table described by a GIF packed-fields byte. */
function colorTableSize(packed: number | undefined): number {
	if (packed === undefined || (packed & 0x80) === 0) return 0;
	return 3 * 2 ** ((packed & 0x07) + 1);
}

/** Returns the index just past a run of GIF data sub-blocks and its terminator. */
function skipGifSubBlocks(bytes: Uint8Array, start: number): number {
	let i = start;
	while (i < bytes.length) {
		const size = bytes[i] ?? 0;
		i += size + 1;
		if (size === 0) break;
	}
	return i;
}

function isAnimatedWebp(bytes: Uint8Array): boolean {
	// "RIFF" size "WEBP", then an extended-format "VP8X" chunk whose flags byte
	// has an animation bit. Simple (non-VP8X) WebP files are always still.
	return ascii(bytes, 12, 4) === 'VP8X' && ((bytes[20] ?? 0) & 0x02) !== 0;
}

function isAnimatedAvif(bytes: Uint8Array): boolean {
	// The leading "ftyp" box lists brands; image sequences carry "avis".
	if (ascii(bytes, 4, 4) !== 'ftyp') return false;
	const boxEnd = Math.min(readUint32(bytes, 0), bytes.length);
	if (ascii(bytes, 8, 4) === 'avis') return true;
	// Compatible brands follow the major brand (4 bytes) and minor version (4 bytes).
	for (let i = 16; i + 4 <= boxEnd; i += 4) {
		if (ascii(bytes, i, 4) === 'avis') return true;
	}
	return false;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
	return String.fromCharCode(...bytes.subarray(start, start + length));
}

function readUint32(bytes: Uint8Array, start: number): number {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(start);
}
