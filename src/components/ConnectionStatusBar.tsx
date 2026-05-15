'use client';

import type { ConnectionStatus } from '@/hooks/useCollaboration';

export type ConnectionStatusBarProps = {
	status: ConnectionStatus;
};

function statusLabel(status: ConnectionStatus): string {
	switch (status) {
		case 'connecting':
			return 'Connecting';
		case 'connected':
			return 'Connected';
		case 'disconnected':
			return 'Offline';
	}
}

function StatusDot({ status }: { status: ConnectionStatus }) {
	switch (status) {
		case 'connecting':
			return (
				<span className='relative flex h-2.5 w-2.5' aria-hidden>
					<span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-500/35 opacity-75' />
					<span className='relative inline-flex h-2.5 w-2.5 rounded-full bg-neutral-600/80' />
				</span>
			);
		case 'connected':
			return <span className='h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600/85' aria-hidden />;
		case 'disconnected':
			return <span className='h-2.5 w-2.5 shrink-0 rounded-full bg-amber-600/75' aria-hidden />;
	}
}

export function ConnectionStatusBar({ status }: ConnectionStatusBarProps) {
	const label = statusLabel(status);

	return (
		<div
			role='status'
			aria-live='polite'
			aria-label={label}
			className='rounded-md border border-neutral-900/10 bg-neutral-900/4 px-3 py-2 text-sm text-neutral-800'>
			<div className='flex items-center gap-2.5'>
				<StatusDot status={status} />
				<span className='font-medium tracking-tight text-neutral-950'>{label}</span>
			</div>
		</div>
	);
}
