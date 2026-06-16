'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { btnSecondary } from '@/lib/ui';

type ShareDocumentButtonProps = {
	documentId: string;
};

export function ShareDocumentButton({ documentId }: ShareDocumentButtonProps) {
	const [copied, setCopied] = useState(false);
	const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopy = useCallback(async () => {
		const url = `${window.location.origin}/doc/${documentId}`;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			if (resetTimerRef.current) {
				clearTimeout(resetTimerRef.current);
			}
			resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback for environments without clipboard API
			setCopied(false);
		}
	}, [documentId]);

	useEffect(() => {
		return () => {
			if (resetTimerRef.current) {
				clearTimeout(resetTimerRef.current);
			}
		};
	}, []);

	return (
		<div className='relative'>
			<button
				type='button'
				onClick={handleCopy}
				className={btnSecondary}
				aria-label={copied ? 'Link copied' : 'Copy share link'}>
				{copied ? 'Copied!' : 'Share'}
			</button>
			<span className='sr-only' aria-live='polite'>
				{copied ? 'Share link copied to clipboard' : ''}
			</span>
		</div>
	);
}
