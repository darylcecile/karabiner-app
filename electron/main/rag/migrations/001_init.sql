CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE files (
	path text PRIMARY KEY,
	mtime_ms bigint NOT NULL,
	indexed_at bigint NOT NULL,
	content_hash text NOT NULL
);

CREATE TABLE chunks (
	id bigserial PRIMARY KEY,
	file_path text NOT NULL REFERENCES files(path) ON DELETE CASCADE,
	chunk_index int NOT NULL,
	content text NOT NULL,
	embedding vector(384),
	heading text,
	UNIQUE (file_path, chunk_index)
);

CREATE INDEX chunks_file_path_idx ON chunks (file_path);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
