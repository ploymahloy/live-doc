import { getRandomInt } from 'trng-crypto';
import {
	DEFAULT_COLLABORATOR_DISPLAY_COLOR,
	parseCollaboratorIdentityForWire,
	parseCollaboratorIdentityFromAwareness,
	type CollaboratorIdentity
} from '@/lib/collaborationMetadataSchemas';

export type { CollaboratorIdentity };
export { DEFAULT_COLLABORATOR_DISPLAY_COLOR };

/**
 * Narrow awareness `user` payloads to CollaboratorIdentity, matching CollaborationCaret semantics.
 */
export function collaboratorIdentityFromAwarenessUser(user: unknown): CollaboratorIdentity | null {
	return parseCollaboratorIdentityFromAwareness(user);
}

/** Display initials for overlapping avatars (first two meaningful word prefixes). */
export function collaboratorInitials(name: string): string {
	const parts = name.split(/[\s-]+/).filter(Boolean);
	if (parts.length === 0) {
		return '?';
	}
	if (parts.length === 1) {
		return parts[0]!.slice(0, Math.min(2, parts[0]!.length)).toUpperCase();
	}
	return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
}

const STORAGE_KEY = 'live-doc-collaborator-identity';

const ANIMALS = [
	'albatross',
	'alpaca',
	'armadillo',
	'axolotl',
	'badger',
	'bear',
	'beaver',
	'binturong',
	'bobcat',
	'capybara',
	'caracal',
	'cassowary',
	'cheetah',
	'condor',
	'cougar',
	'coyote',
	'crane',
	'deer',
	'dingo',
	'dolphin',
	'duck',
	'eagle',
	'echidna',
	'falcon',
	'ferret',
	'finch',
	'flamingo',
	'fox',
	'gannet',
	'gecko',
	'hare',
	'hedgehog',
	'heron',
	'hornbill',
	'hyena',
	'ibis',
	'iguana',
	'jackal',
	'jaguar',
	'kestrel',
	'kingfisher',
	'koala',
	'lemur',
	'leopard',
	'lion',
	'llama',
	'lynx',
	'macaw',
	'magpie',
	'manatee',
	'meerkat',
	'mongoose',
	'narwhal',
	'newt',
	'numbat',
	'ocelot',
	'octopus',
	'orca',
	'osprey',
	'otter',
	'owl',
	'panda',
	'pangolin',
	'parrot',
	'pelican',
	'penguin',
	'platypus',
	'porcupine',
	'puffin',
	'quail',
	'quokka',
	'raccoon',
	'raven',
	'salamander',
	'serval',
	'skunk',
	'starling',
	'stoat',
	'stork',
	'tapir',
	'tarsier',
	'tern',
	'tiger',
	'toucan',
	'vulture',
	'wallaby',
	'walrus',
	'wolf',
	'wombat',
	'wren'
] as const;

const COLOR_PALETTE = [
	'#e74c3c',
	'#2980b9',
	'#27ae60',
	'#8e44ad',
	'#d35400',
	'#16a085',
	'#c0392b',
	'#f39c12',
	'#1abc9c',
	'#34495e',
	'#e67e22',
	'#3498db',
	'#9b59b6',
	'#e91e63',
	'#009688'
] as const;

function capitalize(word: string): string {
	const trimmed = word.trim();
	if (trimmed.length === 0) {
		return '';
	}
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function titleCaseAnimal(animal: string): string {
	return animal
		.split(/[\s-]+/)
		.filter(Boolean)
		.map(capitalize)
		.join(' ');
}

function randomIndexBelow(length: number): number {
	const range = BigInt(length);
	if (length <= 0) {
		throw new RangeError('randomIndexBelow expects length > 0.');
	}
	if (length === 1) {
		return 0;
	}

	const digitLength = Math.max(2, String(length).length + 4);
	const nine = BigInt(9);
	const ten = BigInt(10);

	while (true) {
		const r = getRandomInt(digitLength, { type: 'bigint' });
		const min = ten ** BigInt(digitLength - 1);
		const offset = r - min;
		const spaceSize = nine * ten ** BigInt(digitLength - 1);
		const limit = spaceSize - (spaceSize % range);
		if (offset < limit) {
			return Number(offset % range);
		}
	}
}

function pickRandom<T>(items: readonly T[]): T {
	return items[randomIndexBelow(items.length)]!;
}

export function generateCollaboratorIdentity(): CollaboratorIdentity {
	const animalRaw = pickRandom(ANIMALS);
	const name = `Anonymous ${titleCaseAnimal(animalRaw)}`;
	const color = pickRandom(COLOR_PALETTE);
	return { name, color };
}

export function getSessionCollaboratorIdentity(): CollaboratorIdentity {
	try {
		if (typeof sessionStorage !== 'undefined') {
			const existing = sessionStorage.getItem(STORAGE_KEY);
			if (existing) {
				const parsed = parseCollaboratorIdentityForWire(JSON.parse(existing) as unknown);
				return parsed;
			}
			const identity = generateCollaboratorIdentity();
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
			return identity;
		}
	} catch {
		// fall through to ephemeral identity
	}
	return generateCollaboratorIdentity();
}
