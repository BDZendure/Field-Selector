import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, FieldSelectorSettings } from "./settings";
import { FieldSelectorSettingTab } from "./settingsTab";
import { PropertyDropdownEngine } from "./propertyDropdown";

export default class FieldSelectorPlugin extends Plugin {
	settings!: FieldSelectorSettings;
	engine?: PropertyDropdownEngine;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new FieldSelectorSettingTab(this.app, this));
		this.engine = new PropertyDropdownEngine(this);
		this.engine.start();
	}

	onunload(): void {
		this.engine?.stop();
		this.engine = undefined;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.engine?.refresh();
	}
}
