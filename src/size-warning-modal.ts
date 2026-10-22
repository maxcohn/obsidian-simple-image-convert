import { App, Modal, Setting } from 'obsidian';
import { formatBytes } from './sizes';

/** Asks whether to keep a conversion that came out larger than the original. */
export function confirmLargerOutput(
	app: App,
	fileName: string,
	inputBytes: number,
	outputBytes: number,
): Promise<boolean> {
	return new Promise((resolve) => {
		new SizeWarningModal(app, fileName, inputBytes, outputBytes, resolve).open();
	});
}

class SizeWarningModal extends Modal {
	private save = false;

	constructor(
		app: App,
		private readonly fileName: string,
		private readonly inputBytes: number,
		private readonly outputBytes: number,
		private readonly resolve: (save: boolean) => void,
	) {
		super(app);
	}

	onOpen() {
		this.setTitle('Converted image is larger');
		this.contentEl.createEl('p', {
			text:
				`Converting ${this.fileName} would grow it from ${formatBytes(this.inputBytes)} ` +
				`to ${formatBytes(this.outputBytes)}. A lower quality setting usually helps.`,
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText('Save anyway')
					.setCta()
					.onClick(() => {
						this.save = true;
						this.close();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
		this.resolve(this.save);
	}
}
