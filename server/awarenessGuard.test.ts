// @vitest-environment node

import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { installAwarenessSanitizer } from './awarenessGuard';

function relay(state: Record<string, unknown>): Record<string, unknown> | undefined {
	const source = new Awareness(new Y.Doc());
	source.setLocalState(state);
	const update = encodeAwarenessUpdate(source, [source.clientID]);

	const target = new Awareness(new Y.Doc());
	installAwarenessSanitizer(target);
	let seen: Record<string, unknown> | undefined;
	target.on('update', () => {
		seen = target.getStates().get(source.clientID);
	});
	applyAwarenessUpdate(target, update, null);
	return seen;
}

describe('awareness sanitizer', () => {
	it('bounds the display name and strips invalid cursor data before listeners run', () => {
		const seen = relay({
			user: { name: 'n'.repeat(200), color: '#abcdef', bio: 'secret' },
			cursor: { anchor: 'nope' }
		});

		expect(seen?.user).toEqual({ name: 'n'.repeat(80), color: '#abcdef' });
		expect(seen?.cursor).toBeUndefined();
	});

	it('drops a user with an invalid color and an oversized cursor', () => {
		const seen = relay({
			user: { name: 'Pat', color: 'red' },
			cursor: { anchor: { blob: 'x'.repeat(3000) }, head: { blob: 'y' } }
		});

		expect(seen?.user).toBeUndefined();
		expect(seen?.cursor).toBeUndefined();
	});
});
