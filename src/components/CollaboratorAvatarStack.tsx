'use client';

import type { CollaboratorIdentity } from '@/lib/collaboratorIdentity';
import { collaboratorInitials } from '@/lib/collaboratorIdentity';
import { readableTextHexOnBackground } from '@/lib/readableTextOnBackground';

export type CollaboratorAvatarStackProps = {
	peers: CollaboratorIdentity[];
	/** Max overlapping avatars before showing a trailing +N badge. Default 8. */
	maxVisible?: number;
};

export function CollaboratorAvatarStack({
	peers,
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
						aria-label={peer.name}
						className={[
							'-ml-2 first:ml-0',
							'inline-flex size-8 select-none items-center justify-center rounded-full',
							'ring-2 ring-white text-[0.65rem] font-semibold tracking-wide',
							'shadow-sm'
						].join(' ')}>
						<span aria-hidden>{initials}</span>
					</span>
				);
			})}
			{overflow > 0 ? (
				<span
					role='listitem'
					title={`${overflow} additional collaborators`}
					className={[
						'-ml-2',
						'inline-flex size-8 select-none items-center justify-center rounded-full',
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
