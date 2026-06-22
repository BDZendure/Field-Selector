import { MarkdownView, Notice, setIcon, TFile } from "obsidian";
import type FieldSelectorPlugin from "./main";

export class PropertyDropdownEngine {
	private observers = new WeakMap<HTMLElement, MutationObserver>();
	private activeContainers = new Set<HTMLElement>();
	private scanScheduled = false;

	// Active popup state (only one open at a time).
	private popup?: HTMLElement;
	private popupOwnerKey?: string;
	private dismissOnClick?: (e: MouseEvent) => void;
	private dismissOnKey?: (e: KeyboardEvent) => void;
	private dismissOnScroll?: () => void;

	constructor(private plugin: FieldSelectorPlugin) {}

	start(): void {
		const ws = this.plugin.app.workspace;
		this.plugin.registerEvent(ws.on("layout-change", () => this.scheduleScan()));
		this.plugin.registerEvent(
			ws.on("active-leaf-change", () => {
				this.closePopup();
				this.scheduleScan();
			}),
		);
		this.plugin.registerEvent(
			ws.on("file-open", () => {
				this.closePopup();
				this.scheduleScan();
			}),
		);
		this.plugin.registerEvent(
			this.plugin.app.metadataCache.on("changed", () => this.scheduleScan()),
		);
		ws.onLayoutReady(() => this.scanAndAttach());
	}

	refresh(): void {
		this.scanAndAttach();
	}

	stop(): void {
		this.closePopup();
		document.querySelectorAll(".fs-chevron").forEach((el) => el.remove());
		this.activeContainers.forEach((c) => this.observers.get(c)?.disconnect());
		this.activeContainers.clear();
	}

	private scheduleScan(): void {
		if (this.scanScheduled) return;
		this.scanScheduled = true;
		queueMicrotask(() => {
			this.scanScheduled = false;
			this.scanAndAttach();
		});
	}

	private scanAndAttach(): void {
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) return;
			const container = view.containerEl.querySelector<HTMLElement>(".metadata-container");
			if (!container) return;
			this.ensureObserver(container);
			this.injectChevrons(container, view.file);
		});
	}

	private ensureObserver(container: HTMLElement): void {
		if (this.observers.has(container)) return;
		this.activeContainers.add(container);
		const obs = new MutationObserver(() => this.scheduleScan());
		obs.observe(container, { childList: true, subtree: true });
		this.observers.set(container, obs);
	}

	private injectChevrons(container: HTMLElement, file: TFile | null): void {
		const fields = this.plugin.settings.fields;
		const known = new Set(Object.keys(fields));

		// 1. Strip chevrons whose key is no longer configured.
		container.querySelectorAll<HTMLElement>(".fs-chevron").forEach((ch) => {
			const k = ch.dataset.key;
			if (!k || !known.has(k)) ch.remove();
		});

		// 2. Inject chevrons for matching rows.
		container
			.querySelectorAll<HTMLElement>("div.metadata-property[data-property-key]")
			.forEach((row) => {
				const key = row.getAttribute("data-property-key");
				if (!key || !known.has(key)) return;

				// Skip non-scalar values (read from metadataCache, not the DOM).
				if (file) {
					const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
					const v = fm ? fm[key] : undefined;
					if (Array.isArray(v) || typeof v === "number" || typeof v === "boolean") {
						row.querySelector(":scope .fs-chevron")?.remove();
						return;
					}
				}

				const valueCell =
					row.querySelector<HTMLElement>(".metadata-property-value") ?? row;
				if (valueCell.querySelector(":scope > .fs-chevron")) return; // idempotent

				const chevron = valueCell.createSpan({ cls: "fs-chevron clickable-icon" });
				setIcon(chevron, "chevron-down");
				chevron.dataset.key = key;
				chevron.setAttribute("aria-label", `Choose ${key}`);
				chevron.addEventListener("mousedown", (evt) => {
					// Stop the property cell from claiming focus before we open.
					evt.preventDefault();
					evt.stopPropagation();
				});
				chevron.addEventListener("click", (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
					this.toggleDropdown(chevron, valueCell, key, file);
				});
			});
	}

	private toggleDropdown(
		chevron: HTMLElement,
		anchor: HTMLElement,
		key: string,
		file: TFile | null,
	): void {
		if (this.popup && this.popupOwnerKey === key && document.body.contains(this.popup)) {
			this.closePopup();
			return;
		}
		this.openDropdown(chevron, anchor, key, file);
	}

	private openDropdown(
		chevron: HTMLElement,
		anchor: HTMLElement,
		key: string,
		file: TFile | null,
	): void {
		this.closePopup();
		if (!file) return;

		const values = this.plugin.settings.fields[key] ?? [];
		const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		const currentValue = fm && typeof fm[key] === "string" ? (fm[key] as string) : null;

		const popup = document.body.createDiv({ cls: "fs-dropdown menu" });
		popup.setAttribute("role", "menu");
		this.popup = popup;
		this.popupOwnerKey = key;

		if (values.length === 0) {
			popup.createDiv({
				cls: "fs-dropdown-empty",
				text: "No values configured",
			});
		} else {
			for (const v of values) {
				const item = popup.createDiv({ cls: "fs-dropdown-item" });
				if (v === currentValue) item.addClass("is-active");
				item.setAttribute("role", "menuitem");
				item.createSpan({ cls: "fs-dropdown-item-label", text: v });
				item.addEventListener("mousedown", (evt) => evt.preventDefault());
				item.addEventListener("click", async (evt) => {
					evt.preventDefault();
					evt.stopPropagation();
					this.closePopup();
					try {
						await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
							frontmatter[key] = v;
						});
					} catch (e) {
						new Notice(`Field Selector: failed to update ${key}`);
						console.error(e);
					}
				});
			}
		}

		this.positionPopup(popup, anchor);

		// Defer listener attachment so the click that opened us doesn't immediately close.
		window.setTimeout(() => {
			if (!this.popup) return;
			this.dismissOnClick = (e: MouseEvent) => {
				if (!this.popup) return;
				const t = e.target as Node | null;
				if (t && (this.popup.contains(t) || chevron.contains(t))) return;
				this.closePopup();
			};
			this.dismissOnKey = (e: KeyboardEvent) => {
				if (e.key === "Escape") {
					e.preventDefault();
					this.closePopup();
				}
			};
			this.dismissOnScroll = () => this.closePopup();
			document.addEventListener("mousedown", this.dismissOnClick, true);
			document.addEventListener("keydown", this.dismissOnKey, true);
			window.addEventListener("scroll", this.dismissOnScroll, true);
		}, 0);
	}

	private positionPopup(popup: HTMLElement, anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const gap = 4;
		popup.style.minWidth = `${Math.max(rect.width, 140)}px`;

		// Measure first, then place — keeps it inside the viewport.
		popup.style.visibility = "hidden";
		popup.style.left = "0";
		popup.style.top = "0";
		const popupRect = popup.getBoundingClientRect();

		let left = rect.left + window.scrollX;
		let top = rect.bottom + window.scrollY + gap;

		const overflowRight = left + popupRect.width - (window.scrollX + window.innerWidth);
		if (overflowRight > 0) left -= overflowRight + 8;
		if (left < window.scrollX + 8) left = window.scrollX + 8;

		const overflowBottom = top + popupRect.height - (window.scrollY + window.innerHeight);
		if (overflowBottom > 0) {
			// Flip above the anchor.
			top = rect.top + window.scrollY - popupRect.height - gap;
			if (top < window.scrollY + 8) top = window.scrollY + 8;
		}

		popup.style.left = `${left}px`;
		popup.style.top = `${top}px`;
		popup.style.visibility = "";
	}

	private closePopup(): void {
		if (this.dismissOnClick) {
			document.removeEventListener("mousedown", this.dismissOnClick, true);
			this.dismissOnClick = undefined;
		}
		if (this.dismissOnKey) {
			document.removeEventListener("keydown", this.dismissOnKey, true);
			this.dismissOnKey = undefined;
		}
		if (this.dismissOnScroll) {
			window.removeEventListener("scroll", this.dismissOnScroll, true);
			this.dismissOnScroll = undefined;
		}
		this.popup?.remove();
		this.popup = undefined;
		this.popupOwnerKey = undefined;
	}
}
