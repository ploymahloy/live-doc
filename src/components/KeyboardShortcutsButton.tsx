'use client';

import { CircleQuestionMark } from 'lucide-react';

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
			aria-label={`Keyboard shortcuts (${shortcutHint})`}
			className={`${btnSecondary} box-border h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-3`}>
			<CircleQuestionMark aria-hidden className='h-5 w-5 shrink-0 sm:hidden' />
			<span className='hidden sm:inline'>Shortcuts</span>
			<kbd className='hidden rounded border border-neutral-900/10 bg-white/60 px-1.5 py-0.5 font-mono text-xs text-neutral-600 sm:inline'>
				{shortcutHint}
			</kbd>
		</button>
	);
}
