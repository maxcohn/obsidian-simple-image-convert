import { Platform } from 'obsidian';

// iOS refuses to allocate canvases above this many pixels.
const IOS_MAX_CANVAS_PIXELS = 4096 * 4096;

/**
 * Decodes an image with the platform's own decoder. EXIF orientation is
 * applied; metadata and color profiles are dropped (pixels end up in sRGB).
 */
export async function decodeImage(bytes: ArrayBuffer, mimeType: string): Promise<ImageData> {
	const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
	try {
		const { width, height } = bitmap;
		if (Platform.isIosApp && width * height > IOS_MAX_CANVAS_PIXELS) {
			throw new Error(`${width}×${height} is larger than iOS can process.`);
		}

		const canvas = createEl('canvas', { attr: { width, height } });
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas is unavailable.');
		context.drawImage(bitmap, 0, 0);
		return context.getImageData(0, 0, width, height);
	} finally {
		bitmap.close();
	}
}
