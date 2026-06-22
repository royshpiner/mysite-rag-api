import type { VercelRequest, VercelResponse } from '@vercel/node';

type AskRequestBody = {
  question?: unknown;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
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

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

  if (!apiKey) {
    response.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
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

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Answer briefly. This is a temporary test endpoint before the RAG knowledge base is connected.\n\nUser question: ${trimmedQuestion}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      response.status(502).json({
        error: 'Gemini request failed',
        details: errorText,
      });
      return;
    }

    const data = (await geminiResponse.json()) as GeminiGenerateResponse;
    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'I do not know.';

    response.status(200).json({ answer });
  } catch (error) {
    response.status(500).json({
      error: 'Failed to answer question',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
