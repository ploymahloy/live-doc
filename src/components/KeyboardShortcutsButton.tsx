'use client';

import { isMacPlatform } from '@/lib/keyboardShortcuts';

type KeyboardShortcutsButtonProps = {
	onClick: () => void;
};

export function KeyboardShortcutsButton({ onClick }: KeyboardShortcutsButtonProps) {
	const shortcutHint = isMacPlatform() ? '⌘K' : 'Ctrl+K';

	return (
		<button
			type='button'
			onClick={onClick}
			aria-label='Keyboard shortcuts'
			className='inline-flex items-center gap-2 rounded-md border border-neutral-900/10 bg-neutral-900/4 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-900/8'>
			<span>Shortcuts</span>
			<kbd className='rounded border border-neutral-900/10 bg-white/60 px-1.5 py-0.5 font-mono text-xs text-neutral-600'>
				{shortcutHint}
			</kbd>
		</button>
	);
}
