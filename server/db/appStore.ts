import { createPostgresPool } from './pool';
import { PostgresDocumentStore } from '../store/postgresStore';

let store: PostgresDocumentStore | undefined;

/** Pool shared by Next.js route handlers. The collab process keeps its own pool. */
export function getAppDocumentStore(): PostgresDocumentStore {
	store ??= new PostgresDocumentStore(createPostgresPool());
	return store;
}
