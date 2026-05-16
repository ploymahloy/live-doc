import * as Y from 'yjs';
import { z } from 'zod';

/** Fallback background for collaboration caret labels; keep in sync with `collaborationCaretRender`. */
export const DEFAULT_COLLABORATOR_DISPLAY_COLOR = '#34495e';

/** Matches y-tiptap `rxValidColor` in yCursorPlugin. */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const relativePositionJsonSchema = z.unknown().refine(
	(val) => {
		try {
			Y.createRelativePositionFromJSON(val);
			return true;
		} catch {
			return false;
		}
	},
	{ message: 'Invalid Y.RelativePosition JSON' }
);

/** Strict shape for outbound wire payloads and session storage. */
export const collaboratorIdentityWireSchema = z.object({
	name: z.string().trim().min(1).max(80),
	color: z.string().regex(HEX_COLOR_REGEX)
});

/**
 * Inbound awareness `user` field: require a display name; coerce missing/invalid colors to the default.
 */
export const collaboratorIdentityFromAwarenessSchema = z
	.object({
		name: z.string().trim().min(1).max(80),
		color: z.string().trim().optional()
	})
	.transform(({ name, color }) => ({
		name,
		color: color && HEX_COLOR_REGEX.test(color) ? color : DEFAULT_COLLABORATOR_DISPLAY_COLOR
	}));

export const awarenessCursorSchema = z.union([
	z.null(),
	z.object({
		anchor: relativePositionJsonSchema,
		head: relativePositionJsonSchema
	})
]);

export type CollaboratorIdentity = z.infer<typeof collaboratorIdentityWireSchema>;
export type AwarenessCursor = z.infer<typeof awarenessCursorSchema>;

export function parseCollaboratorIdentityForWire(value: unknown): CollaboratorIdentity {
	return collaboratorIdentityWireSchema.parse(value);
}

export function parseCollaboratorIdentityFromAwareness(value: unknown): CollaboratorIdentity | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const result = collaboratorIdentityFromAwarenessSchema.safeParse(value);
	return result.success ? result.data : null;
}

export function parseAwarenessCursorForWire(value: unknown): AwarenessCursor {
	return awarenessCursorSchema.parse(value);
}

export function parseAwarenessCursorFromAwareness(value: unknown): AwarenessCursor | null {
	const result = awarenessCursorSchema.safeParse(value);
	return result.success ? result.data : null;
}

export function warnInvalidAwareness(field: 'user' | 'cursor', clientId: number, issues: z.ZodIssue[]): void {
	console.warn(
		`[live-doc] Invalid awareness ${field} from client ${clientId}:`,
		issues.map((i) => i.message).join('; ')
	);
}
