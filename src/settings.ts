export type FieldDefinitions = Record<string, string[]>;

export interface FieldSelectorSettings {
	fields: FieldDefinitions;
}

export const DEFAULT_SETTINGS: FieldSelectorSettings = {
	fields: {
		status: ["Idea", "Planning", "Active", "Done"],
		priority: ["Low", "Medium", "High"],
	},
};
