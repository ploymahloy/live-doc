import Link from 'next/link';

import { Editor } from '@/components/Editor';
import { isValidDocumentId } from '@/lib/documentId';
import { btnPrimary } from '@/lib/ui';

type DocPageProps = {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ token?: string | string[] }>;
};

function firstQueryValue(value: string | string[] | undefined): string {
	if (Array.isArray(value)) {
		return value[0] ?? '';
	}
	return value ?? '';
}

export default async function DocPage({ params, searchParams }: DocPageProps) {
	const { id } = await params;
	const token = firstQueryValue((await searchParams).token);

	if (!isValidDocumentId(id)) {
		return (
			<main className='mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-12 sm:px-6'>
				<div className='space-y-4 text-center'>
					<h1 className='text-xl font-semibold tracking-tight text-neutral-950'>Document not found</h1>
					<p className='text-sm text-neutral-600'>
						This link doesn&apos;t point to a valid document. Check the URL or create a new one.
					</p>
					<Link href='/' className={btnPrimary}>
						Go home
					</Link>
				</div>
			</main>
		);
	}

	if (!token) {
		return (
			<main className='mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-12 sm:px-6'>
				<div className='space-y-4 text-center'>
					<h1 className='text-xl font-semibold tracking-tight text-neutral-950'>Link incomplete</h1>
					<p className='text-sm text-neutral-600'>
						This document link is missing its access token. Open a share link, or create a new document.
					</p>
					<Link href='/' className={btnPrimary}>
						Go home
					</Link>
				</div>
			</main>
		);
	}

	return (
		<main className='mx-auto min-h-screen max-w-3xl px-3 py-6 sm:px-6 sm:py-8'>
			<Editor documentId={id} token={token} />
		</main>
	);
}
