import { getRequiredEnv } from './env.js';

type GeminiEmbeddingResponse = {
  embedding?: {
    values?: number[];
  };
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

const geminiUrl = (model: string, action: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}?key=${getRequiredEnv(
    'GEMINI_API_KEY'
  )}`;

export const embedText = async (text: string): Promise<number[]> => {
  const model = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001';
  const response = await fetch(geminiUrl(model, 'embedContent'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: `models/${model}`,
      content: {
        parts: [{ text }],
      },
      outputDimensionality: 768,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini embedding request failed: ${await response.text()}`);
  }

  const data = (await response.json()) as GeminiEmbeddingResponse;
  const values = data.embedding?.values;

  if (!values?.length) {
    throw new Error('Gemini embedding response did not include values');
  }

  return values;
};

export const generateAnswer = async (prompt: string): Promise<string> => {
  const models = [
    process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-2.0-flash',
  ].filter((model, index, list) => model && list.indexOf(model) === index);

  let lastError = '';

  for (const model of models) {
    const response = await fetch(geminiUrl(model, 'generateContent'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as GeminiGenerateResponse;
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'I do not know.';
    }

    lastError = await response.text();
  }

  throw new Error(`Gemini generation request failed: ${lastError}`);
};
