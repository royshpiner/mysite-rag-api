import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { getPool, vectorLiteral } from '../lib/db.js';
import { embedText } from '../lib/gemini.js';
import { chunkText } from '../lib/rag.js';

type SourceDocument = {
  source: string;
  sourceId: string;
  content: string;
};

const RAG_DATA_DIR = path.join(process.cwd(), 'ragdata');
const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.pdf']);

const readPdf = async (filePath: string) => {
  const data = await fs.readFile(filePath);
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  return result.text;
};

const readDocument = async (filePath: string): Promise<SourceDocument | null> => {
  const extension = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return null;
  }

  const relativePath = path.relative(RAG_DATA_DIR, filePath);
  const content =
    extension === '.pdf'
      ? await readPdf(filePath)
      : await fs.readFile(filePath, 'utf8');

  return {
    source: extension.slice(1),
    sourceId: relativePath,
    content,
  };
};

const collectFiles = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.name.startsWith('.')) {
        return [];
      }

      if (entry.isDirectory()) {
        return collectFiles(entryPath);
      }

      return [entryPath];
    })
  );

  return files.flat();
};

const hashContent = (content: string) =>
  crypto.createHash('sha256').update(content).digest('hex');

const existingChunkHashes = async (source: SourceDocument) => {
  const result = await getPool().query<{
    chunk_index: number;
    content_hash: string | null;
  }>(
    'SELECT chunk_index, content_hash FROM knowledge_base WHERE source = $1 AND source_id = $2',
    [source.source, source.sourceId]
  );

  return new Map(
    result.rows.map((row) => [row.chunk_index, row.content_hash ?? ''])
  );
};

const saveChunk = async (
  source: SourceDocument,
  chunkIndex: number,
  chunkContent: string,
  contentHash: string,
  embedding: number[]
) => {
  await getPool().query(
    `
      INSERT INTO knowledge_base
        (source, source_id, chunk_index, content_hash, chunk_content, embeddings_768, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6::vector, NOW())
      ON CONFLICT (source, source_id, chunk_index)
      DO UPDATE SET
        content_hash = EXCLUDED.content_hash,
        chunk_content = EXCLUDED.chunk_content,
        embeddings_768 = EXCLUDED.embeddings_768,
        updated_at = NOW()
    `,
    [
      source.source,
      source.sourceId,
      chunkIndex,
      contentHash,
      chunkContent,
      vectorLiteral(embedding),
    ]
  );
};

const ingest = async () => {
  const files = await collectFiles(RAG_DATA_DIR);
  const documents = (
    await Promise.all(files.map((filePath) => readDocument(filePath)))
  ).filter((document): document is SourceDocument => Boolean(document));

  console.log(`Found ${documents.length} RAG documents`);

  for (const document of documents) {
    const chunks = chunkText(document.content);
    const existingHashes = await existingChunkHashes(document);

    console.log(`Indexing ${document.sourceId}; ${chunks.length} chunks`);

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const contentHash = hashContent(chunk);

      if (existingHashes.get(chunkIndex) === contentHash) {
        console.log(`Skipping unchanged ${document.sourceId} chunk ${chunkIndex + 1}/${chunks.length}`);
        continue;
      }

      console.log(`Embedding ${document.sourceId} chunk ${chunkIndex + 1}/${chunks.length}`);
      const embedding = await embedText(chunk);
      await saveChunk(document, chunkIndex, chunk, contentHash, embedding);
    }

    await getPool().query(
      'DELETE FROM knowledge_base WHERE source = $1 AND source_id = $2 AND chunk_index >= $3',
      [document.source, document.sourceId, chunks.length]
    );
  }

  await getPool().end();
  console.log('RAG ingestion complete');
};

ingest().catch(async (error) => {
  console.error(error);
  await getPool().end();
  process.exit(1);
});
