// iOS refuses to allocate canvases above 4096^2 pixels, so larger images are
// drawn one tile at a time into a buffer that has no such limit.
const TILE_SIZE = 4096;

/**
 * Decodes an image with the platform's own decoder. EXIF orientation is
 * applied; metadata and color profiles are dropped (pixels end up in sRGB).
 */
export async function decodeImage(bytes: ArrayBuffer, mimeType: string): Promise<ImageData> {
	const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
	try {
		const { width, height } = bitmap;
		const canvas = createEl('canvas', {
			attr: { width: Math.min(width, TILE_SIZE), height: Math.min(height, TILE_SIZE) },
		});
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Canvas is unavailable.');

		const pixels = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y += TILE_SIZE) {
			for (let x = 0; x < width; x += TILE_SIZE) {
				const tileWidth = Math.min(TILE_SIZE, width - x);
				const tileHeight = Math.min(TILE_SIZE, height - y);
				// Otherwise transparent pixels show the previous tile through.
				context.clearRect(0, 0, tileWidth, tileHeight);
				context.drawImage(bitmap, x, y, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
				const tile = context.getImageData(0, 0, tileWidth, tileHeight).data;
				const rowLength = tileWidth * 4;
				for (let row = 0; row < tileHeight; row++) {
					pixels.set(
						tile.subarray(row * rowLength, (row + 1) * rowLength),
						((y + row) * width + x) * 4,
					);
				}
			}
		}
		return new ImageData(pixels, width, height);
	} finally {
		bitmap.close();
	}
}
