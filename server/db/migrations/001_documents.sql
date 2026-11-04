CREATE TABLE documents (
	id text PRIMARY KEY,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_updates (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	document_id text NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
	update bytea NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_updates_document_id_id_idx ON document_updates (document_id, id);

CREATE TABLE document_snapshots (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	document_id text NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
	state bytea NOT NULL,
	up_to_update_id bigint NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_snapshots_document_id_id_idx ON document_snapshots (document_id, id DESC);
