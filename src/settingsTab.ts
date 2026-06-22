import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import type FieldSelectorPlugin from "./main";

export class FieldSelectorSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: FieldSelectorPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "Configure frontmatter fields and the values their dropdowns offer.",
			cls: "setting-item-description",
		});

		const list = containerEl.createDiv({ cls: "fs-field-list" });

		const entries = Object.entries(this.plugin.settings.fields);
		if (entries.length === 0) {
			list.createDiv({
				cls: "fs-empty-hint",
				text: "No fields yet. Add one below.",
			});
		}

		entries.forEach(([name, values]) => this.renderFieldRow(list, name, values));

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Add field")
				.setCta()
				.onClick(async () => {
					const newName = this.uniqueName("field");
					this.plugin.settings.fields[newName] = [];
					await this.plugin.saveSettings();
					this.display();
				}),
		);
	}

	private renderFieldRow(parent: HTMLElement, name: string, values: string[]): void {
		const row = parent.createDiv({ cls: "fs-field-row" });

		// Header: name input + delete button
		const header = row.createDiv({ cls: "fs-field-header" });

		const nameInput = header.createEl("input", { cls: "fs-field-name" });
		nameInput.type = "text";
		nameInput.value = name;
		nameInput.placeholder = "field name";

		const commitRename = async () => {
			const next = nameInput.value.trim();
			if (next === name) return;
			if (!next) {
				this.flashError(nameInput);
				nameInput.value = name;
				return;
			}
			if (next !== name && this.plugin.settings.fields[next] !== undefined) {
				this.flashError(nameInput);
				nameInput.value = name;
				return;
			}
			this.plugin.settings.fields = this.renameKey(
				this.plugin.settings.fields,
				name,
				next,
			);
			await this.plugin.saveSettings();
			this.display();
		};
		nameInput.addEventListener("blur", () => {
			void commitRename();
		});
		nameInput.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				nameInput.blur();
			} else if (evt.key === "Escape") {
				evt.preventDefault();
				nameInput.value = name;
				nameInput.blur();
			}
		});

		const del = header.createDiv({ cls: "clickable-icon fs-field-delete" });
		setIcon(del, "trash-2");
		del.setAttribute("aria-label", `Delete field ${name}`);
		del.addEventListener("click", async () => {
			delete this.plugin.settings.fields[name];
			await this.plugin.saveSettings();
			this.display();
		});

		// Chip list
		const chipList = row.createDiv({ cls: "fs-chip-list" });
		this.renderChipList(chipList, name, values);

		// Add-value input
		const addInput = row.createEl("input", { cls: "fs-add-value" });
		addInput.type = "text";
		addInput.placeholder = "Add value…";
		const commitAdd = async () => {
			const v = addInput.value.trim();
			if (!v) return;
			const arr = this.plugin.settings.fields[name];
			if (!arr) return;
			if (arr.includes(v)) {
				this.flashError(addInput);
				addInput.value = "";
				return;
			}
			arr.push(v);
			await this.plugin.saveSettings();
			addInput.value = "";
			this.renderChipList(chipList, name, arr);
		};
		addInput.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				void commitAdd();
			}
		});
		addInput.addEventListener("blur", () => {
			if (addInput.value.trim()) void commitAdd();
		});
	}

	private renderChipList(parent: HTMLElement, fieldName: string, values: string[]): void {
		parent.empty();
		if (values.length === 0) {
			parent.createDiv({ cls: "fs-chip-empty", text: "No values yet." });
			return;
		}
		values.forEach((value, index) => {
			const chip = parent.createSpan({ cls: "fs-chip" });
			chip.createSpan({ text: value });
			const remove = chip.createSpan({ cls: "fs-chip-remove" });
			setIcon(remove, "x");
			remove.setAttribute("aria-label", `Remove ${value}`);
			remove.addEventListener("click", async () => {
				const arr = this.plugin.settings.fields[fieldName];
				if (!arr) return;
				arr.splice(index, 1);
				await this.plugin.saveSettings();
				this.renderChipList(parent, fieldName, arr);
			});
		});
	}

	private renameKey<T>(obj: Record<string, T>, from: string, to: string): Record<string, T> {
		const out: Record<string, T> = {};
		for (const [k, v] of Object.entries(obj)) {
			out[k === from ? to : k] = v;
		}
		return out;
	}

	private uniqueName(base: string): string {
		const fields = this.plugin.settings.fields;
		if (fields[base] === undefined) return base;
		let i = 2;
		while (fields[`${base}${i}`] !== undefined) i++;
		return `${base}${i}`;
	}

	private flashError(el: HTMLElement): void {
		el.addClass("fs-error");
		window.setTimeout(() => el.removeClass("fs-error"), 600);
	}
}
