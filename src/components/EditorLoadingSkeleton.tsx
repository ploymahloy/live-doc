import { surfaceCard } from '@/lib/ui';

export function EditorLoadingSkeleton() {
	return (
		<div className='space-y-3' aria-busy='true' aria-label='Loading editor'>
			<div className={[surfaceCard, 'animate-pulse overflow-hidden'].join(' ')}>
				<div className='h-10 border-b border-neutral-900/10 bg-neutral-900/4' />
				<div className='space-y-3 p-4'>
					<div className='h-7 w-2/3 rounded bg-neutral-900/8' />
					<div className='h-4 w-full rounded bg-neutral-900/6' />
					<div className='h-4 w-5/6 rounded bg-neutral-900/6' />
					<div className='h-4 w-4/5 rounded bg-neutral-900/6' />
				</div>
			</div>
			<p className='sr-only'>Preparing editor…</p>
		</div>
	);
}
