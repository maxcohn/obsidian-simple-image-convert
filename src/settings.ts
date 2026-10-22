import { PluginSettingTab, SettingDefinitionItem } from 'obsidian';

export interface SimpleImageConvertSettings {
	/** Encoder quality, from 1 (smallest file) to 100 (best quality). */
	quality: number;
}

export const DEFAULT_SETTINGS: SimpleImageConvertSettings = {
	// Matches libwebp's own default (cwebp -q 75).
	quality: 75,
};

export class SimpleImageConvertSettingTab extends PluginSettingTab {
	/** Rendered by Obsidian, which reads and persists values through `plugin.settings`. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Quality',
				desc: 'Lower values produce smaller files with more visible compression artifacts.',
				control: {
					type: 'slider',
					key: 'quality',
					min: 1,
					max: 100,
					step: 1,
					defaultValue: DEFAULT_SETTINGS.quality,
				},
			},
		];
	}
}
