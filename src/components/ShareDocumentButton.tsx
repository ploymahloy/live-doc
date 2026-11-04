'use client';

import { Check, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { btnSecondary } from '@/lib/ui';

type ShareDocumentButtonProps = {
	documentId: string;
	token: string;
};

export function ShareDocumentButton({ documentId, token }: ShareDocumentButtonProps) {
	const [copied, setCopied] = useState(false);
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState('');
	const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopy = useCallback(async () => {
		setPending(true);
		setNotice('');
		try {
			const response = await fetch(`/api/documents/${documentId}/share`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ role: 'editor' })
			});
			if (!response.ok) {
				setCopied(false);
				setNotice('Could not create a share link');
				return;
			}
			const body = (await response.json()) as { token?: string };
			if (!body.token) {
				setCopied(false);
				setNotice('Could not create a share link');
				return;
			}
			const url = `${window.location.origin}/doc/${documentId}?token=${encodeURIComponent(body.token)}`;
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setNotice('Share link copied to clipboard');
			if (resetTimerRef.current) {
				clearTimeout(resetTimerRef.current);
			}
			resetTimerRef.current = setTimeout(() => {
				setCopied(false);
				setNotice('');
			}, 2000);
		} catch {
			setCopied(false);
			setNotice('Could not create a share link');
		} finally {
			setPending(false);
		}
	}, [documentId, token]);

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
				disabled={pending}
				className={`${btnSecondary} box-border h-10 w-10 p-0 sm:h-9 sm:w-auto sm:px-3`}
				aria-label={copied ? 'Link copied' : 'Copy share link'}>
				{copied ?
					<Check aria-hidden className='h-5 w-5 shrink-0 sm:h-4 sm:w-4' />
				:	<Share2 aria-hidden className='h-5 w-5 shrink-0 sm:h-4 sm:w-4' />}
			</button>
			<span className='sr-only' aria-live='polite'>
				{notice}
			</span>
		</div>
	);
}
