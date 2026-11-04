/**
 * Durable document log. Load replays the latest snapshot plus every update
 * appended after it. Compact folds those updates into a new snapshot.
 */
export interface DocumentStore {
	load(documentName: string): Promise<Uint8Array | null>;
	appendUpdate(documentName: string, update: Uint8Array): Promise<void>;
	pendingUpdateCount(documentName: string): Promise<number>;
	compact(documentName: string): Promise<void>;
	/** True when the document row exists, including rows that have no updates yet. */
	hasDocument(documentName: string): Promise<boolean>;
	/** Insert the document row if it is missing. Does not write a snapshot. */
	ensureDocument(documentName: string): Promise<void>;
	close(): Promise<void>;
}
