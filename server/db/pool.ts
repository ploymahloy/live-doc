import { Pool } from 'pg';

export function readPositiveInt(value: string | undefined, fallback: number): number {
	if (!value?.trim()) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

export function createPostgresPool(env: NodeJS.ProcessEnv = process.env): Pool {
	const connectionString = env.DATABASE_URL?.trim();
	if (!connectionString) {
		throw new Error('DATABASE_URL is required to start the collaboration server');
	}

	return new Pool({
		connectionString,
		max: readPositiveInt(env.DATABASE_POOL_MAX, 10)
	});
}
