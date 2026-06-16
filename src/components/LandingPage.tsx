'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { createDocumentId } from '@/lib/documentId';
import { btnPrimary } from '@/lib/ui';

export function LandingPage() {
	const router = useRouter();

	const handleNewDocument = () => {
		router.push(`/doc/${createDocumentId()}`);
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

				<button type='button' onClick={handleNewDocument} className={btnPrimary}>
					New document
				</button>
			</div>
		</div>
	);
}
