'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { btnPrimary } from '@/lib/ui';

export function LandingPage() {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState('');

	const handleNewDocument = async () => {
		setPending(true);
		setError('');
		try {
			const response = await fetch('/api/documents', { method: 'POST' });
			if (!response.ok) {
				setError('Could not create a document');
				return;
			}
			const body = (await response.json()) as { id?: string; token?: string };
			if (!body.id || !body.token) {
				setError('Could not create a document');
				return;
			}
			router.push(`/doc/${body.id}?token=${encodeURIComponent(body.token)}`);
		} catch {
			setError('Could not create a document');
		} finally {
			setPending(false);
		}
	};

	return (
		<div className='flex min-h-screen flex-col items-center justify-center px-4 py-12'>
			<div className='w-full max-w-md space-y-8 text-center'>
				<div className='space-y-3'>
					<Link
						href='/'
						className='inline-block text-2xl font-semibold tracking-tight text-neutral-950'>
						Live Doc
					</Link>
					<p className='text-base text-neutral-600'>
						Collaborative rich-text editing in real time. Create a document and share the link with
						anyone.
					</p>
				</div>

				<button type='button' onClick={handleNewDocument} className={btnPrimary} disabled={pending}>
					New document
				</button>
				{error ? <p className='text-sm text-neutral-600'>{error}</p> : null}
			</div>
		</div>
	);
}
