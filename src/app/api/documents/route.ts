import { readCapabilityTtlSeconds, readCollabJwtSecret } from '../../../../server/auth/capabilityToken';
import { getAppDocumentStore } from '../../../../server/db/appStore';
import { accessErrorResponse, createDocumentAccess } from '../../../../server/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
	try {
		const created = await createDocumentAccess(
			getAppDocumentStore(),
			readCollabJwtSecret(),
			readCapabilityTtlSeconds()
		);
		return Response.json(
			{ id: created.documentId, token: created.token, role: created.role },
			{ status: 201 }
		);
	} catch (error) {
		return accessErrorResponse(error);
	}
}
