'use client';

import { useEffect } from 'react';

type UseKeyboardShortcutOptions = {
	key: string;
	metaOrCtrl?: boolean;
	onTrigger: () => void;
	enabled?: boolean;
};

function isNativeFormField(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	const tagName = target.tagName;
	return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

export function useKeyboardShortcut({
	key,
	metaOrCtrl = false,
	onTrigger,
	enabled = true
}: UseKeyboardShortcutOptions): void {
	useEffect(() => {
		if (!enabled) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== key.toLowerCase()) {
				return;
			}

			if (metaOrCtrl && !(event.metaKey || event.ctrlKey)) {
				return;
			}

			if (event.shiftKey || event.altKey) {
				return;
			}

			if (isNativeFormField(event.target)) {
				return;
			}

			event.preventDefault();
			onTrigger();
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [key, metaOrCtrl, onTrigger, enabled]);
}
