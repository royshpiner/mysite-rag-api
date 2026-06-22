import { getPool } from '../lib/db';

const migrate = async () => {
  const pool = getPool();

  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      chunk_content TEXT NOT NULL,
      embeddings_768 vector(768) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (source, source_id, chunk_index)
    )
  `);

  await pool.query(`
    ALTER TABLE knowledge_base
    ADD COLUMN IF NOT EXISTS content_hash TEXT
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS knowledge_base_embeddings_768_cosine_idx
    ON knowledge_base
    USING ivfflat (embeddings_768 vector_cosine_ops)
    WITH (lists = 100)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS knowledge_base_source_idx
    ON knowledge_base (source, source_id)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS knowledge_base_source_chunk_unique_idx
    ON knowledge_base (source, source_id, chunk_index)
  `);

  await pool.end();
  console.log('RAG database migration complete');
};

migrate().catch(async (error) => {
  console.error(error);
  await getPool().end();
  process.exit(1);
});
