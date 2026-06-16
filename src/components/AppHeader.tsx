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
		<header className='flex flex-wrap items-center justify-between gap-4 gap-y-3'>
			<div className='flex min-w-0 shrink items-center gap-4'>
				<Link
					href='/'
					className='text-base font-semibold tracking-tight text-neutral-950 hover:text-neutral-700'>
					Live Doc
				</Link>
				<ConnectionStatusBar status={status} />
			</div>
			<div className='flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2.5'>
				<ShareDocumentButton documentId={documentId} />
				{shortcutsTrigger}
				<span className='hidden text-sm font-medium tracking-tight text-neutral-600 sm:inline'>Online</span>
				<CollaboratorAvatarStack peers={peers} currentUser={currentUser} onUpdateProfile={onUpdateProfile} />
			</div>
		</header>
	);
}
