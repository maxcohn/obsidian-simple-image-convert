import { Menu, Plugin, TAbstractFile, TFile } from 'obsidian';
import { convertImage } from './convert';
import { webpEncoder } from './encoders/webp';
import { inputMimeType } from './formats';
import {
	DEFAULT_SETTINGS,
	SimpleImageConvertSettings,
	SimpleImageConvertSettingTab,
} from './settings';

export default class SimpleImageConvertPlugin extends Plugin {
	settings!: SimpleImageConvertSettings;

	async onload() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SimpleImageConvertSettings>,
		);
		this.addSettingTab(new SimpleImageConvertSettingTab(this.app, this));
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => this.addConvertMenuItem(menu, file)),
		);
	}

	private addConvertMenuItem(menu: Menu, file: TAbstractFile) {
		if (!(file instanceof TFile) || !inputMimeType(file.extension)) return;

		menu.addItem((item) =>
			item
				.setTitle(`Convert to ${webpEncoder.label}`)
				.setIcon('image')
				.onClick(() => convertImage(this.app, file, webpEncoder, this.settings.quality)),
		);
	}
}
