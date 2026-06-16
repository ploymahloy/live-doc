export type ShortcutCategory = 'app' | 'formatting';

export type ShortcutDef = {
	id: string;
	label: string;
	macKeys: string;
	winKeys: string;
	category: ShortcutCategory;
};

export const KEYBOARD_SHORTCUTS: ShortcutDef[] = [
	{
		id: 'open-shortcuts',
		label: 'Open shortcuts',
		macKeys: '⌘K',
		winKeys: 'Ctrl+K',
		category: 'app'
	},
	{
		id: 'close-shortcuts',
		label: 'Close shortcuts',
		macKeys: 'Esc',
		winKeys: 'Esc',
		category: 'app'
	},
	{
		id: 'bold',
		label: 'Bold',
		macKeys: '⌘B',
		winKeys: 'Ctrl+B',
		category: 'formatting'
	},
	{
		id: 'italic',
		label: 'Italic',
		macKeys: '⌘I',
		winKeys: 'Ctrl+I',
		category: 'formatting'
	},
	{
		id: 'heading-1',
		label: 'Heading 1',
		macKeys: '⌘⌥1',
		winKeys: 'Ctrl+Alt+1',
		category: 'formatting'
	},
	{
		id: 'heading-2',
		label: 'Heading 2',
		macKeys: '⌘⌥2',
		winKeys: 'Ctrl+Alt+2',
		category: 'formatting'
	},
	{
		id: 'heading-3',
		label: 'Heading 3',
		macKeys: '⌘⌥3',
		winKeys: 'Ctrl+Alt+3',
		category: 'formatting'
	},
	{
		id: 'paragraph',
		label: 'Paragraph',
		macKeys: '⌘⌥0',
		winKeys: 'Ctrl+Alt+0',
		category: 'formatting'
	},
	{
		id: 'code-block',
		label: 'Code block',
		macKeys: '⌘⌥C',
		winKeys: 'Ctrl+Alt+C',
		category: 'formatting'
	}
];

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
	app: 'App',
	formatting: 'Formatting'
};

export function isMacPlatform(): boolean {
	if (typeof navigator === 'undefined') {
		return false;
	}

	const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
	if (userAgentData?.platform) {
		return userAgentData.platform === 'macOS';
	}

	return /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

export function formatShortcutKeys(def: ShortcutDef, isMac: boolean): string {
	return isMac ? def.macKeys : def.winKeys;
}
