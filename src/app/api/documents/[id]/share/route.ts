import { readCapabilityTtlSeconds, readCollabJwtSecret } from '../../../../../../server/auth/capabilityToken';
import { getAppDocumentStore } from '../../../../../../server/db/appStore';
import { accessErrorResponse, shareDocumentAccess, type ShareRole } from '../../../../../../server/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ShareRouteProps = {
	params: Promise<{ id: string }>;
};

function bearerToken(request: Request): string {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer\s+(\S+)/i.exec(header);
	return match?.[1] ?? '';
}

function isShareRole(value: unknown): value is ShareRole {
	return value === 'editor' || value === 'viewer';
}

export async function POST(request: Request, { params }: ShareRouteProps): Promise<Response> {
	try {
		const { id } = await params;
		let role: unknown;
		try {
			const body = (await request.json()) as { role?: unknown };
			role = body.role;
		} catch {
			role = undefined;
		}
		if (!isShareRole(role)) {
			return Response.json({ error: 'role must be editor or viewer' }, { status: 400 });
		}

		const shared = await shareDocumentAccess({
			store: getAppDocumentStore(),
			secret: readCollabJwtSecret(),
			ttlSeconds: readCapabilityTtlSeconds(),
			documentId: id,
			actorToken: bearerToken(request),
			role
		});
		return Response.json(shared);
	} catch (error) {
		return accessErrorResponse(error);
	}
}
