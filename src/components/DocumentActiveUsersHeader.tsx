'use client';

import { CollaboratorAvatarStack } from '@/components/CollaboratorAvatarStack';
import { ConnectionStatusBar } from '@/components/ConnectionStatusBar';
import type { ConnectionStatus } from '@/hooks/useCollaboration';
import type { CollaboratorIdentity } from '@/lib/collaboratorIdentity';

export type DocumentActiveUsersHeaderProps = {
	status: ConnectionStatus;
	peers: CollaboratorIdentity[];
};

export function DocumentActiveUsersHeader({ status, peers }: DocumentActiveUsersHeaderProps) {
	return (
		<header className='flex flex-wrap items-center justify-between gap-4 gap-y-3'>
			<div className='min-w-0 shrink'>
				<ConnectionStatusBar status={status} />
			</div>
			<div className='flex min-w-0 shrink-0 items-center gap-2.5'>
				<span className='hidden text-sm font-medium tracking-tight text-neutral-600 sm:inline'>Online</span>
				<CollaboratorAvatarStack peers={peers} />
			</div>
		</header>
	);
}
