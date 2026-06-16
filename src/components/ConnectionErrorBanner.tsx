'use client';

import { btnSecondary } from '@/lib/ui';

type ConnectionErrorBannerProps = {
	message: string;
	onDismiss: () => void;
};

export function ConnectionErrorBanner({ message, onDismiss }: ConnectionErrorBannerProps) {
	return (
		<div
			role='alert'
			className='flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'>
			<p>
				Could not connect to sync server — editing offline.{' '}
				<span className='text-amber-800'>{message}</span>
			</p>
			<button type='button' onClick={onDismiss} className={btnSecondary} aria-label='Dismiss'>
				Dismiss
			</button>
		</div>
	);
}
