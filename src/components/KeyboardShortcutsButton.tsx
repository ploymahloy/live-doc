'use client';

import { isMacPlatform } from '@/lib/keyboardShortcuts';
import { btnSecondary } from '@/lib/ui';

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
			className={btnSecondary}>
			<span>Shortcuts</span>
			<kbd className='rounded border border-neutral-900/10 bg-white/60 px-1.5 py-0.5 font-mono text-xs text-neutral-600'>
				{shortcutHint}
			</kbd>
		</button>
	);
}
