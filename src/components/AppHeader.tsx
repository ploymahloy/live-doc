'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { CollaboratorAvatarStack } from '@/components/CollaboratorAvatarStack';
import { ConnectionStatusBar } from '@/components/ConnectionStatusBar';
import { ShareDocumentButton } from '@/components/ShareDocumentButton';
import type { ConnectionStatus } from '@/hooks/useCollaboration';
import type { CollaboratorIdentity } from '@/lib/collaboratorIdentity';

export type AppHeaderProps = {
	documentId: string;
	status: ConnectionStatus;
	peers: CollaboratorIdentity[];
	currentUser: CollaboratorIdentity;
	onUpdateProfile?: (identity: CollaboratorIdentity) => void;
	shortcutsTrigger?: ReactNode;
};

export function AppHeader({
	documentId,
	status,
	peers,
	currentUser,
	onUpdateProfile,
	shortcutsTrigger
}: AppHeaderProps) {
	return (
		<header className='flex min-w-0 flex-col gap-2'>
			<div className='flex min-w-0 items-center justify-between gap-2 sm:gap-3'>
				<div className='flex min-w-0 items-center gap-2 sm:gap-3'>
					<Link href='/' className='text-base font-semibold tracking-tight text-neutral-950 hover:text-neutral-700 sm:text-lg'>
						Live Doc
					</Link>
					<ConnectionStatusBar status={status} />
				</div>
				<div className='flex min-w-0 flex-wrap items-center justify-end gap-2.5'>
					<ShareDocumentButton documentId={documentId} />
					{shortcutsTrigger}
					<CollaboratorAvatarStack peers={peers} currentUser={currentUser} onUpdateProfile={onUpdateProfile} />
				</div>
			</div>
		</header>
	);
}
