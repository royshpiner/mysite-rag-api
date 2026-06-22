import type { VercelRequest, VercelResponse } from '@vercel/node';

type AskRequestBody = {
  question?: unknown;
};

const allowedOrigin = process.env.ALLOWED_ORIGIN ?? '*';

const setCorsHeaders = (response: VercelResponse) => {
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const readBody = async (request: VercelRequest): Promise<AskRequestBody> => {
  if (request.body && typeof request.body === 'object') {
    return request.body as AskRequestBody;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? (JSON.parse(rawBody) as AskRequestBody) : {};
};

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { question } = await readBody(request);
    const trimmedQuestion = String(question ?? '').trim();

    if (!trimmedQuestion) {
      response.status(400).json({ error: 'question is required' });
      return;
    }

    if (trimmedQuestion.length > 1000) {
      response.status(400).json({ error: 'question is too long' });
      return;
    }

    const { answerWithRag } = await import('../lib/rag.js');
    const answer = await answerWithRag(trimmedQuestion);
    response.status(200).json({ answer });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';

    if (
      details.includes('RESOURCE_EXHAUSTED') ||
      details.includes('UNAVAILABLE') ||
      details.toLowerCase().includes('quota') ||
      details.toLowerCase().includes('high demand')
    ) {
      response.status(200).json({
        answer:
          'The chat is temporarily unavailable because the AI model is rate-limited or under high demand. Please try again shortly.',
      });
      return;
    }

    response.status(500).json({
      error: 'Failed to answer question',
      details,
    });
  }
}
