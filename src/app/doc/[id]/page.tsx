import Link from 'next/link';

import { Editor } from '@/components/Editor';
import { isValidDocumentId } from '@/lib/documentId';
import { btnPrimary } from '@/lib/ui';

type DocPageProps = {
	params: Promise<{ id: string }>;
};

export default async function DocPage({ params }: DocPageProps) {
	const { id } = await params;

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

	return (
		<main className='mx-auto min-h-screen max-w-3xl px-3 py-6 sm:px-6 sm:py-8'>
			<Editor documentId={id} />
		</main>
	);
}
