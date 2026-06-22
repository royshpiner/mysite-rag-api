const allowedOrigin = process.env.ALLOWED_ORIGIN ?? '*';

const setCorsHeaders = (response) => {
  response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const readBody = async (request) => {
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
};

export default async function handler(request, response) {
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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

    const data = await geminiResponse.json();
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
