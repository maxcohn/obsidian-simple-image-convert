import { App, Notice, TFile } from 'obsidian';
import { decodeImage } from './decode';
import type { ImageEncoder } from './encoders/encoder';
import { inputMimeType, isAnimated } from './formats';
import { formatBytes } from './sizes';

/** Converts an image file in the vault, reporting progress and failures as notices. */
export async function convertImage(
	app: App,
	file: TFile,
	encoder: ImageEncoder,
	quality: number,
): Promise<void> {
	const mimeType = inputMimeType(file.extension);
	if (!mimeType) return;

	const input = await app.vault.readBinary(file);
	if (isAnimated(new Uint8Array(input), mimeType)) {
		new Notice(`${file.name} is animated and can't be converted without losing frames.`);
		return;
	}

	const progress = new Notice(`Converting ${file.name}…`, 0);
	try {
		await afterPaint();
		const image = await decodeImage(input, mimeType);
		const output = await encoder.encode(image, quality);

		// Temporary: write next to the original. Replacing it comes in phase 3.
		const outputPath = `${file.path.slice(0, -file.extension.length)}converted.${encoder.extension}`;
		await app.vault.createBinary(outputPath, output);
		new Notice(
			`Created ${outputPath} (${formatBytes(input.byteLength)} → ${formatBytes(output.byteLength)}).`,
		);
	} catch (error) {
		console.error(`Failed to convert ${file.path}`, error);
		new Notice(`Couldn't convert ${file.name}: ${errorMessage(error)}`);
	} finally {
		progress.hide();
	}
}

/** Resolves once the browser has painted, so notices show before encoding blocks the thread. */
function afterPaint(): Promise<void> {
	return new Promise((resolve) => {
		window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
