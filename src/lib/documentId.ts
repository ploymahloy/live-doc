/** UUID v4 pattern for document room IDs. */
const DOCUMENT_ID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidDocumentId(id: string): boolean {
	return DOCUMENT_ID_REGEX.test(id);
}

export function createDocumentId(): string {
	return crypto.randomUUID();
}
