import { describe, expect, it } from 'vitest';

import { peekCapabilityRole } from '@/lib/capabilityRole';

function tokenWithRole(role: unknown): string {
	const payload = btoa(JSON.stringify({ role }));
	return `header.${payload}.signature`;
}

describe('peekCapabilityRole', () => {
	it('reads a role from the payload without verifying the signature', () => {
		expect(peekCapabilityRole(tokenWithRole('viewer'))).toBe('viewer');
		expect(peekCapabilityRole(tokenWithRole('owner'))).toBe('owner');
	});

	it('returns null for a missing or unknown role', () => {
		expect(peekCapabilityRole('not-a-token')).toBeNull();
		expect(peekCapabilityRole(tokenWithRole('admin'))).toBeNull();
		expect(peekCapabilityRole('a.%%%')).toBeNull();
	});
});
