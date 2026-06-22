import { getPool, vectorLiteral } from './db.js';
import { embedText, generateAnswer } from './gemini.js';

export type RetrievedChunk = {
  source: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  distance: number;
};

const MAX_CONTEXT_CHUNKS = 5;

export const chunkText = (text: string, wordsPerChunk = 400): string[] => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const chunks: string[] = [];

  for (let index = 0; index < words.length; index += wordsPerChunk) {
    const chunk = words.slice(index, index + wordsPerChunk).join(' ');

    if (chunk) {
      chunks.push(chunk);
    }
  }

  return chunks;
};

export const retrieveRelevantChunks = async (
  question: string,
  limit = MAX_CONTEXT_CHUNKS
): Promise<RetrievedChunk[]> => {
  const questionEmbedding = await embedText(question);
  const result = await getPool().query<{
    source: string;
    source_id: string;
    chunk_index: number;
    chunk_content: string;
    distance: string;
  }>(
    `
      SELECT
        source,
        source_id,
        chunk_index,
        chunk_content,
        embeddings_768 <=> $1::vector AS distance
      FROM knowledge_base
      WHERE embeddings_768 IS NOT NULL
      ORDER BY embeddings_768 <=> $1::vector
      LIMIT $2
    `,
    [vectorLiteral(questionEmbedding), limit]
  );

  return result.rows.map((row) => ({
    source: row.source,
    sourceId: row.source_id,
    chunkIndex: row.chunk_index,
    content: row.chunk_content,
    distance: Number(row.distance),
  }));
};

export const answerWithRag = async (question: string): Promise<string> => {
  const chunks = await retrieveRelevantChunks(question);

  if (chunks.length === 0) {
    return 'I do not know. The knowledge base has no indexed content yet.';
  }

  const context = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] Source: ${chunk.source}/${chunk.sourceId} chunk ${
          chunk.chunkIndex
        }\n${chunk.content}`
    )
    .join('\n\n');

  return generateAnswer(`
You are Roy Shpiner's website assistant.
Answer the user's question using only the context below.
If the answer is not in the context, say you do not know.
Keep the answer concise and factual.

Context:
${context}

Question:
${question}
`);
};
