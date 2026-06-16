'use client';

import { useEffect, useId, useRef } from 'react';

import {
	KEYBOARD_SHORTCUTS,
	SHORTCUT_CATEGORY_LABELS,
	formatShortcutKeys,
	isMacPlatform,
	type ShortcutCategory,
	type ShortcutDef
} from '@/lib/keyboardShortcuts';

type KeyboardShortcutsDialogProps = {
	open: boolean;
	onClose: () => void;
};

const CATEGORY_ORDER: ShortcutCategory[] = ['app', 'formatting'];

function groupShortcutsByCategory(shortcuts: ShortcutDef[]): Record<ShortcutCategory, ShortcutDef[]> {
	return shortcuts.reduce(
		(groups, shortcut) => {
			groups[shortcut.category].push(shortcut);
			return groups;
		},
		{ app: [], formatting: [] } as Record<ShortcutCategory, ShortcutDef[]>
	);
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
	const titleId = useId();
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const isMac = isMacPlatform();
	const groupedShortcuts = groupShortcutsByCategory(KEYBOARD_SHORTCUTS);

	useEffect(() => {
		if (!open) {
			return;
		}

		closeButtonRef.current?.focus();

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
			<button
				type='button'
				className='absolute inset-0 bg-neutral-900/20'
				aria-label='Close keyboard shortcuts'
				onClick={onClose}
			/>
			<div
				role='dialog'
				aria-modal='true'
				aria-labelledby={titleId}
				className='relative z-10 w-full max-w-md rounded-md border border-neutral-900/10 bg-white p-5 shadow-lg'>
				<div className='mb-4 flex items-start justify-between gap-4'>
					<h2 id={titleId} className='text-base font-semibold tracking-tight text-neutral-950'>
						Keyboard shortcuts
					</h2>
					<button
						ref={closeButtonRef}
						type='button'
						onClick={onClose}
						className='rounded-md border border-neutral-900/10 bg-neutral-900/4 px-2 py-1 text-sm font-medium text-neutral-950 hover:bg-neutral-900/8'
						aria-label='Close'>
						×
					</button>
				</div>

				<div className='space-y-5'>
					{CATEGORY_ORDER.map(category => {
						const shortcuts = groupedShortcuts[category];
						if (shortcuts.length === 0) {
							return null;
						}

						return (
							<section key={category} className='space-y-2'>
								<h3 className='text-xs font-semibold tracking-wide text-neutral-500 uppercase'>
									{SHORTCUT_CATEGORY_LABELS[category]}
								</h3>
								<ul className='space-y-2'>
									{shortcuts.map(shortcut => (
										<li key={shortcut.id} className='flex items-center justify-between gap-4'>
											<span className='text-sm text-neutral-800'>{shortcut.label}</span>
											<kbd className='rounded-md border border-neutral-900/10 bg-neutral-900/4 px-2 py-1 font-mono text-xs text-neutral-700'>
												{formatShortcutKeys(shortcut, isMac)}
											</kbd>
										</li>
									))}
								</ul>
							</section>
						);
					})}
				</div>
			</div>
		</div>
	);
}
