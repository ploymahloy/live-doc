'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
	COLOR_PALETTE,
	type CollaboratorIdentity,
	collaboratorInitials
} from '@/lib/collaboratorIdentity';
import { parseCollaboratorIdentityForWire } from '@/lib/collaborationMetadataSchemas';
import { btnPrimary, btnSecondary, inputField } from '@/lib/ui';
import { readableTextHexOnBackground } from '@/lib/readableTextOnBackground';

type ProfilePopoverProps = {
	identity: CollaboratorIdentity;
	onSave: (identity: CollaboratorIdentity) => void;
};

export function ProfilePopover({ identity, onSave }: ProfilePopoverProps) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(identity.name);
	const [color, setColor] = useState(identity.color);
	const [error, setError] = useState<string | null>(null);
	const popoverId = useId();
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const initials = collaboratorInitials(identity.name);
	const textColor = readableTextHexOnBackground(identity.color);

	const handleToggle = useCallback(() => {
		setOpen(prev => {
			if (prev) {
				return false;
			}
			setName(identity.name);
			setColor(identity.color);
			setError(null);
			return true;
		});
	}, [identity.name, identity.color]);

	useEffect(() => {
		if (!open) {
			return;
		}

		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
				return;
			}
			setOpen(false);
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setOpen(false);
				triggerRef.current?.focus();
			}
		};

		document.addEventListener('mousedown', handlePointerDown);
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [open]);

	const handleSave = useCallback(() => {
		try {
			const updated = parseCollaboratorIdentityForWire({ name, color });
			onSave(updated);
			setOpen(false);
		} catch {
			setError('Enter a name between 1 and 80 characters.');
		}
	}, [name, color, onSave]);

	return (
		<div className='relative'>
			<button
				ref={triggerRef}
				type='button'
				onClick={handleToggle}
				aria-expanded={open}
				aria-controls={popoverId}
				aria-label='Edit your profile'
				style={{ backgroundColor: identity.color, color: textColor }}
				className='inline-flex size-8 select-none items-center justify-center rounded-full text-[0.65rem] font-semibold tracking-wide shadow-sm ring-2 ring-neutral-950 ring-offset-1'>
				<span aria-hidden>{initials}</span>
			</button>

			{open ?
				<div
					ref={panelRef}
					id={popoverId}
					role='dialog'
					aria-label='Edit profile'
					className='absolute top-full right-0 z-40 mt-2 w-72 rounded-md border border-neutral-900/10 bg-white p-4 shadow-lg'>
					<div className='space-y-4'>
						<div className='space-y-1'>
							<label htmlFor={`${popoverId}-name`} className='text-xs font-medium text-neutral-600'>
								Display name
							</label>
							<input
								id={`${popoverId}-name`}
								type='text'
								value={name}
								maxLength={80}
								onChange={e => setName(e.target.value)}
								className={inputField}
							/>
							{error ?
								<p className='text-xs text-amber-700' role='alert'>
									{error}
								</p>
							:	null}
						</div>

						<fieldset>
							<legend className='mb-2 text-xs font-medium text-neutral-600'>Color</legend>
							<div className='flex flex-wrap gap-2'>
								{COLOR_PALETTE.map(paletteColor => (
									<button
										key={paletteColor}
										type='button'
										aria-label={`Select color ${paletteColor}`}
										aria-pressed={color === paletteColor}
										onClick={() => setColor(paletteColor)}
										style={{ backgroundColor: paletteColor }}
										className={[
											'size-7 rounded-full border-2 transition-transform hover:scale-110',
											color === paletteColor ? 'border-neutral-950' : 'border-transparent'
										].join(' ')}
									/>
								))}
							</div>
						</fieldset>

						<div className='flex justify-end gap-2'>
							<button type='button' onClick={() => setOpen(false)} className={btnSecondary}>
								Cancel
							</button>
							<button type='button' onClick={handleSave} className={btnPrimary}>
								Save
							</button>
						</div>
					</div>
				</div>
			:	null}
		</div>
	);
}
