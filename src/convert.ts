import { App, Notice, TFile } from 'obsidian';
import { decodeImage } from './decode';
import type { ImageEncoder } from './encoders/encoder';
import { inputMimeType, isAnimated, withExtension } from './formats';
import { confirmLargerOutput } from './size-warning-modal';
import { formatBytes, formatSizeChange } from './sizes';

/**
 * Converts an image file in the vault, replacing it with the encoded output.
 * Progress, refusals, and failures are reported as notices.
 */
export async function convertImage(
	app: App,
	file: TFile,
	encoder: ImageEncoder,
	quality: number,
): Promise<void> {
	const mimeType = inputMimeType(file.extension);
	if (!mimeType) return;

	const fileName = file.name;
	const inPlace = file.extension.toLowerCase() === encoder.extension;
	const targetPath = inPlace ? file.path : withExtension(file.path, encoder.extension);
	if (!inPlace && app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`Can't convert ${fileName}: ${targetPath} already exists.`);
		return;
	}

	const input = await app.vault.readBinary(file);
	if (isAnimated(new Uint8Array(input), mimeType)) {
		new Notice(`${fileName} is animated and can't be converted without losing frames.`);
		return;
	}

	let output: ArrayBuffer;
	const progress = new Notice(`Converting ${fileName}…`, 0);
	try {
		await afterPaint();
		output = await encoder.encode(await decodeImage(input, mimeType), quality);
	} catch (error) {
		reportFailure(fileName, error);
		return;
	} finally {
		progress.hide();
	}

	if (
		output.byteLength >= input.byteLength &&
		!(await confirmLargerOutput(app, fileName, input.byteLength, output.byteLength))
	) {
		return;
	}

	try {
		await replaceFile(app, file, input, output, targetPath);
	} catch (error) {
		reportFailure(fileName, error);
		return;
	}
	new Notice(
		`Converted ${fileName}: ${formatBytes(input.byteLength)} → ${formatBytes(output.byteLength)} ` +
			`(${formatSizeChange(input.byteLength, output.byteLength)}).`,
	);
}

/**
 * Puts the output at `targetPath`, keeps links pointing at it, and sends the
 * original bytes through Obsidian's trash so they stay recoverable.
 */
async function replaceFile(
	app: App,
	file: TFile,
	input: ArrayBuffer,
	output: ArrayBuffer,
	targetPath: string,
): Promise<void> {
	const originalPath = file.path;
	if (targetPath === originalPath) {
		// Links already point at this path, so swap the file out from under them.
		await app.fileManager.trashFile(file);
		await app.vault.createBinary(originalPath, output);
		return;
	}

	// The steps are ordered so the original bytes always live in some file: a
	// failure part way through is undone instead of leaving a mislabeled or lost
	// image. Renaming through the file manager updates links per the user's
	// preferences, and runs first so that if it fails, nothing has changed yet.
	await app.fileManager.renameFile(file, targetPath);
	let backup: TFile | undefined;
	try {
		backup = await app.vault.createBinary(originalPath, input);
		await app.vault.modifyBinary(file, output);
	} catch (error) {
		try {
			// Trashed rather than deleted, in case the failed write damaged `file`.
			if (backup) await app.fileManager.trashFile(backup);
			await app.fileManager.renameFile(file, originalPath);
		} catch (undoError) {
			console.error(`Failed to undo converting ${originalPath}`, undoError);
			throw new Error(
				`${errorMessage(error)} (undoing also failed, so check ${targetPath} and ${originalPath})`,
			);
		}
		throw error;
	}

	try {
		await app.fileManager.trashFile(backup);
	} catch (error) {
		// The conversion itself succeeded, so report this without failing it.
		console.error(`Failed to trash ${originalPath}`, error);
		new Notice(`Couldn't move the original to the trash. It's still at ${originalPath}.`);
	}
}

/** Resolves once the browser has painted, so notices show before encoding blocks the thread. */
function afterPaint(): Promise<void> {
	return new Promise((resolve) => {
		window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
	});
}

function reportFailure(fileName: string, error: unknown) {
	console.error(`Failed to convert ${fileName}`, error);
	new Notice(`Couldn't convert ${fileName}: ${errorMessage(error)}`);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
