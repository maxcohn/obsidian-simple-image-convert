import type { App, TFile, Vault } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertImage } from './convert';
import type { ImageEncoder } from './encoders/encoder';
import { confirmLargerOutput } from './size-warning-modal';

const notices = vi.hoisted(() => [] as { message: string; hidden: boolean }[]);

vi.mock('obsidian', () => ({
	Notice: class {
		private readonly notice = { message: '', hidden: false };
		constructor(message: string) {
			this.notice.message = message;
			notices.push(this.notice);
		}
		hide() {
			this.notice.hidden = true;
		}
	},
}));
// Decoding and the size warning need a browser and a user; the encoder stub ignores pixels anyway.
vi.mock('./decode', () => ({ decodeImage: () => Promise.resolve({}) }));
vi.mock('./size-warning-modal', () => ({ confirmLargerOutput: vi.fn() }));

const INPUT = [1, 2, 3, 4, 5, 6, 7, 8];
const SMALLER = [9, 9, 9];
const LARGER = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9];

class FakeFile implements TFile {
	// Unused by conversion.
	parent = null;
	vault = {} as Vault;
	stat = { ctime: 0, mtime: 0, size: 0 };

	constructor(
		public path: string,
		public data: ArrayBuffer,
	) {}
	get name() {
		return this.path.slice(this.path.lastIndexOf('/') + 1);
	}
	get basename() {
		return this.name.slice(0, this.name.lastIndexOf('.'));
	}
	get extension() {
		return this.name.slice(this.name.lastIndexOf('.') + 1);
	}
}

/** The parts of Obsidian's vault and file manager that conversion uses, backed by a map. */
class FakeVault {
	readonly files = new Map<string, FakeFile>();
	readonly trash: FakeFile[] = [];

	readonly vault = {
		getAbstractFileByPath: (path: string) => this.files.get(path) ?? null,
		readBinary: (file: FakeFile) => Promise.resolve(file.data.slice(0)),
		createBinary: (path: string, data: ArrayBuffer) => {
			if (this.files.has(path)) return Promise.reject(new Error('File already exists.'));
			const file = new FakeFile(path, data);
			this.files.set(path, file);
			return Promise.resolve(file);
		},
		modifyBinary: (file: FakeFile, data: ArrayBuffer) => {
			file.data = data;
			return Promise.resolve();
		},
	};

	readonly fileManager = {
		// Obsidian moves the existing file object, which is what keeps links pointing at it.
		renameFile: (file: FakeFile, newPath: string) => {
			if (this.files.has(newPath)) return Promise.reject(new Error('File already exists.'));
			this.files.delete(file.path);
			file.path = newPath;
			this.files.set(newPath, file);
			return Promise.resolve();
		},
		trashFile: (file: FakeFile) => {
			this.files.delete(file.path);
			this.trash.push(file);
			return Promise.resolve();
		},
	};

	readonly app = { vault: this.vault, fileManager: this.fileManager } as unknown as App;

	constructor(files: Record<string, number[] | Uint8Array>) {
		for (const [path, bytes] of Object.entries(files)) {
			this.files.set(path, new FakeFile(path, Uint8Array.from(bytes).buffer));
		}
	}

	file(path: string): TFile {
		const file = this.files.get(path);
		if (!file) throw new Error(`No file at ${path}`);
		return file;
	}

	/** Every file in the vault, as path → bytes. */
	contents(): Record<string, number[]> {
		return Object.fromEntries([...this.files].map(([path, file]) => [path, bytesOf(file)]));
	}

	/** Every trashed file, as original path → bytes. */
	trashed(): Record<string, number[]> {
		return Object.fromEntries(this.trash.map((file) => [file.path, bytesOf(file)]));
	}
}

function bytesOf(file: FakeFile): number[] {
	return [...new Uint8Array(file.data)];
}

const encode = vi.fn<ImageEncoder['encode']>();
const encoder: ImageEncoder = { label: 'WebP', extension: 'webp', encode };

function encodesTo(bytes: number[]) {
	encode.mockResolvedValue(Uint8Array.from(bytes).buffer);
}

/** Messages of the notices still showing, which leaves out the progress notice once hidden. */
function shownNotices(): string[] {
	return notices.filter((notice) => !notice.hidden).map((notice) => notice.message);
}

async function convert(vault: FakeVault, path: string) {
	await convertImage(vault.app, vault.file(path), encoder, 75);
}

beforeEach(() => {
	notices.length = 0;
	encode.mockReset();
	encodesTo(SMALLER);
	vi.mocked(confirmLargerOutput).mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.stubGlobal('window', {
		requestAnimationFrame: (callback: () => void) => callback(),
		setTimeout: (callback: () => void) => callback(),
	});
});

describe('convertImage', () => {
	it('replaces the image with the output and trashes the original', async () => {
		const vault = new FakeVault({ 'img/photo.jpg': INPUT });
		const renamed = vault.file('img/photo.jpg');

		await convert(vault, 'img/photo.jpg');

		expect(vault.contents()).toEqual({ 'img/photo.webp': SMALLER });
		expect(vault.trashed()).toEqual({ 'img/photo.jpg': INPUT });
		// The original file object was renamed rather than replaced, so links follow it.
		expect(vault.file('img/photo.webp')).toBe(renamed);
		expect(shownNotices()).toEqual(['Converted photo.jpg: 8 B → 3 B (−62%).']);
	});

	it('replaces an image already in the output format at the same path', async () => {
		const vault = new FakeVault({ 'photo.webp': INPUT });

		await convert(vault, 'photo.webp');

		expect(vault.contents()).toEqual({ 'photo.webp': SMALLER });
		expect(vault.trashed()).toEqual({ 'photo.webp': INPUT });
	});

	it('ignores files that are not supported images', async () => {
		const vault = new FakeVault({ 'notes.md': INPUT });

		await convert(vault, 'notes.md');

		expect(encode).not.toHaveBeenCalled();
		expect(vault.contents()).toEqual({ 'notes.md': INPUT });
		expect(notices).toEqual([]);
	});

	it('refuses to overwrite an existing file at the target path', async () => {
		const vault = new FakeVault({ 'photo.jpg': INPUT, 'photo.webp': LARGER });

		await convert(vault, 'photo.jpg');

		expect(encode).not.toHaveBeenCalled();
		expect(vault.contents()).toEqual({ 'photo.jpg': INPUT, 'photo.webp': LARGER });
		expect(shownNotices()).toEqual([expect.stringContaining('photo.webp already exists')]);
	});

	it('refuses animated images', async () => {
		const animated = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8X\x0a\0\0\0\x02');
		const vault = new FakeVault({ 'anim.webp': animated });

		await convert(vault, 'anim.webp');

		expect(encode).not.toHaveBeenCalled();
		expect(vault.contents()).toEqual({ 'anim.webp': [...animated] });
		expect(shownNotices()).toEqual([expect.stringContaining('is animated')]);
	});

	it('leaves the vault unchanged when encoding fails', async () => {
		const vault = new FakeVault({ 'photo.jpg': INPUT });
		encode.mockRejectedValue(new Error('Out of memory.'));

		await convert(vault, 'photo.jpg');

		expect(vault.contents()).toEqual({ 'photo.jpg': INPUT });
		expect(vault.trashed()).toEqual({});
		expect(shownNotices()).toEqual(["Couldn't convert photo.jpg: Out of memory."]);
	});

	describe('when the output is larger', () => {
		it('keeps the original if the user cancels', async () => {
			vi.mocked(confirmLargerOutput).mockResolvedValue(false);
			encodesTo(LARGER);
			const vault = new FakeVault({ 'photo.jpg': INPUT });

			await convert(vault, 'photo.jpg');

			expect(confirmLargerOutput).toHaveBeenCalledWith(vault.app, 'photo.jpg', 8, 10);
			expect(vault.contents()).toEqual({ 'photo.jpg': INPUT });
			expect(shownNotices()).toEqual([]);
		});

		it('saves the output if the user confirms', async () => {
			vi.mocked(confirmLargerOutput).mockResolvedValue(true);
			encodesTo(LARGER);
			const vault = new FakeVault({ 'photo.jpg': INPUT });

			await convert(vault, 'photo.jpg');

			expect(vault.contents()).toEqual({ 'photo.webp': LARGER });
			expect(shownNotices()).toEqual(['Converted photo.jpg: 8 B → 10 B (+25%).']);
		});
	});

	describe('when replacing the file fails', () => {
		it('changes nothing if the rename fails', async () => {
			const vault = new FakeVault({ 'photo.jpg': INPUT });
			vi.spyOn(vault.fileManager, 'renameFile').mockRejectedValueOnce(new Error('Locked.'));

			await convert(vault, 'photo.jpg');

			expect(vault.contents()).toEqual({ 'photo.jpg': INPUT });
			expect(vault.trashed()).toEqual({});
			expect(shownNotices()).toEqual(["Couldn't convert photo.jpg: Locked."]);
		});

		it('restores the original if writing the backup fails', async () => {
			const vault = new FakeVault({ 'photo.jpg': INPUT });
			vi.spyOn(vault.vault, 'createBinary').mockRejectedValueOnce(new Error('Disk full.'));

			await convert(vault, 'photo.jpg');

			expect(vault.contents()).toEqual({ 'photo.jpg': INPUT });
			expect(vault.trashed()).toEqual({});
			expect(shownNotices()).toEqual(["Couldn't convert photo.jpg: Disk full."]);
		});

		it('restores the original if writing the output fails', async () => {
			const vault = new FakeVault({ 'photo.jpg': INPUT });
			vi.spyOn(vault.vault, 'modifyBinary').mockRejectedValueOnce(new Error('Disk full.'));

			await convert(vault, 'photo.jpg');

			expect(vault.contents()).toEqual({ 'photo.jpg': INPUT });
			expect(vault.trashed()).toEqual({ 'photo.jpg': INPUT });
			expect(shownNotices()).toEqual(["Couldn't convert photo.jpg: Disk full."]);
		});

		it('names both paths if undoing also fails', async () => {
			const vault = new FakeVault({ 'photo.jpg': INPUT });
			vi.spyOn(vault.vault, 'modifyBinary').mockRejectedValueOnce(new Error('Disk full.'));
			vi.spyOn(vault.fileManager, 'trashFile').mockRejectedValueOnce(new Error('Locked.'));

			await convert(vault, 'photo.jpg');

			// The original bytes survive in the backup.
			expect(vault.contents()).toEqual({ 'photo.webp': INPUT, 'photo.jpg': INPUT });
			expect(shownNotices()).toEqual([
				"Couldn't convert photo.jpg: Disk full. (undoing also failed, so check photo.webp and photo.jpg)",
			]);
		});

		it('keeps the original in the trash if an in-place write fails', async () => {
			const vault = new FakeVault({ 'photo.webp': INPUT });
			vi.spyOn(vault.vault, 'createBinary').mockRejectedValueOnce(new Error('Disk full.'));

			await convert(vault, 'photo.webp');

			expect(vault.contents()).toEqual({});
			expect(vault.trashed()).toEqual({ 'photo.webp': INPUT });
			expect(shownNotices()).toEqual(["Couldn't convert photo.webp: Disk full."]);
		});
	});

	it('still converts if the original cannot be trashed', async () => {
		const vault = new FakeVault({ 'photo.jpg': INPUT });
		vi.spyOn(vault.fileManager, 'trashFile').mockRejectedValueOnce(new Error('Locked.'));

		await convert(vault, 'photo.jpg');

		expect(vault.contents()).toEqual({ 'photo.webp': SMALLER, 'photo.jpg': INPUT });
		expect(shownNotices()).toEqual([
			"Couldn't move the original to the trash. It's still at photo.jpg.",
			'Converted photo.jpg: 8 B → 3 B (−62%).',
		]);
	});
});
