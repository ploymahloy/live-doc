'use client';

import { ProfilePopover } from '@/components/ProfilePopover';
import type { CollaboratorIdentity } from '@/lib/collaboratorIdentity';
import { collaboratorInitials } from '@/lib/collaboratorIdentity';
import { readableTextHexOnBackground } from '@/lib/readableTextOnBackground';

export type CollaboratorAvatarStackProps = {
	peers: CollaboratorIdentity[];
	/** Highlights the current user's avatar with a ring. */
	currentUser?: CollaboratorIdentity;
	onUpdateProfile?: (identity: CollaboratorIdentity) => void;
	/** Max overlapping avatars before showing a trailing +N badge. Default 8. */
	maxVisible?: number;
};

function isSameIdentity(a: CollaboratorIdentity, b: CollaboratorIdentity): boolean {
	return a.name === b.name && a.color === b.color;
}

export function CollaboratorAvatarStack({
	peers,
	currentUser,
	onUpdateProfile,
	maxVisible = 8
}: CollaboratorAvatarStackProps) {
	const overflow = peers.length > maxVisible ? peers.length - maxVisible : 0;
	const visiblePeers = overflow > 0 ? peers.slice(0, maxVisible) : peers;
	const listAria =
		peers.length === 0
			? 'No collaborators connected'
			: `Active collaborators: ${peers.length}${overflow > 0 ? `. Showing ${maxVisible}; ${overflow} not shown.` : ''}`;

	return (
		<div role='list' className='flex flex-row flex-wrap items-center justify-end' aria-label={listAria}>
			{visiblePeers.map((peer, index) => {
				const initials = collaboratorInitials(peer.name);
				const textColor = readableTextHexOnBackground(peer.color);
				const isCurrentUser = currentUser ? isSameIdentity(peer, currentUser) : false;
				const avatarClassName = [
					'inline-flex size-7 select-none items-center justify-center rounded-full sm:size-8',
					'ring-2 text-[0.6rem] font-semibold tracking-wide shadow-sm sm:text-[0.65rem]',
					isCurrentUser ? 'ring-neutral-950 ring-offset-1' : 'ring-white',
					!isCurrentUser || !onUpdateProfile ? '-ml-1.5 first:ml-0 sm:-ml-2' : ''
				]
					.filter(Boolean)
					.join(' ');

				if (isCurrentUser && currentUser && onUpdateProfile) {
					return (
						<ProfilePopover
							key={`${peer.name}\0${peer.color}\0${index}`}
							className='-ml-1.5 first:ml-0 sm:-ml-2'
							identity={currentUser}
							onSave={onUpdateProfile}>
							{triggerProps => (
								<button
									{...triggerProps}
									type='button'
									role='listitem'
									title={peer.name}
									style={{
										backgroundColor: peer.color,
										color: textColor,
										zIndex: index + 1
									}}
									aria-label={`${peer.name} (you). Edit profile.`}
									className={avatarClassName}>
									<span aria-hidden>{initials}</span>
								</button>
							)}
						</ProfilePopover>
					);
				}

				return (
					<span
						role='listitem'
						key={`${peer.name}\0${peer.color}\0${index}`}
						title={peer.name}
						style={{
							backgroundColor: peer.color,
							color: textColor,
							zIndex: index + 1
						}}
						aria-label={isCurrentUser ? `${peer.name} (you)` : peer.name}
						className={avatarClassName}>
						<span aria-hidden>{initials}</span>
					</span>
				);
			})}
			{overflow > 0 ? (
				<span
					role='listitem'
					title={`${overflow} additional collaborators`}
					className={[
						'-ml-1.5 sm:-ml-2',
						'inline-flex size-7 select-none items-center justify-center rounded-full sm:size-8',
						'bg-neutral-200 text-neutral-950 ring-2 ring-white shadow-sm',
						'text-xs font-semibold tabular-nums'
					].join(' ')}
					style={{ zIndex: visiblePeers.length + 2 }}
					aria-label={`${overflow} additional collaborators not shown.`}>
					<span aria-hidden>+{overflow}</span>
				</span>
			) : null}
		</div>
	);
}
