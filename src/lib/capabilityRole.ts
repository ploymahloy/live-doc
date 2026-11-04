/** Roles carried by a collaboration capability token. */
export const CAPABILITY_ROLES = ['owner', 'editor', 'viewer'] as const;

export type CapabilityRole = (typeof CAPABILITY_ROLES)[number];

export function isCapabilityRole(value: unknown): value is CapabilityRole {
	return typeof value === 'string' && (CAPABILITY_ROLES as readonly string[]).includes(value);
}

/**
 * Read the role from a token payload for UI only.
 * The collaboration server verifies the signature before trusting it.
 */
export function peekCapabilityRole(token: string): CapabilityRole | null {
	const payload = token.split('.')[1];
	if (!payload) {
		return null;
	}

	try {
		const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
		const json = JSON.parse(atob(padded)) as { role?: unknown };
		return isCapabilityRole(json.role) ? json.role : null;
	} catch {
		return null;
	}
}
