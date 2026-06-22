# MySite RAG API

Serverless backend for the MySite chat experience.

## Current Scope

The API answers questions with retrieval-augmented generation. It embeds the
user question, retrieves only the most relevant chunks from Postgres/pgvector,
and asks Gemini to answer using only that retrieved context.

## Endpoints

- `GET /api/health`
- `POST /api/ask`

`POST /api/ask` expects:

```json
{
  "question": "Who is Roy?"
}
```

## Environment Variables

- `GEMINI_API_KEY`
- `GEMINI_MODEL` optional, defaults to `gemini-2.5-flash`
- `GEMINI_FALLBACK_MODEL` optional, defaults to `gemini-2.5-flash-lite`
- `GEMINI_EMBEDDING_MODEL` optional, defaults to `gemini-embedding-001`
- `DATABASE_URL` Postgres connection string with pgvector support
- `DATABASE_SSL` optional, defaults to `true`; set to `false` for local Postgres
- `ALLOWED_ORIGIN` optional, for example `https://royshpiner.github.io`

## RAG Data

Project knowledge files live in `ragdata/`. Supported file types are:

- `.md`
- `.txt`
- `.pdf`

Each source file is split into 400-word chunks. Each chunk is embedded with
Gemini `gemini-embedding-001` at 768 dimensions and stored in the
`knowledge_base` table.

## Database Setup

Use a Postgres database with pgvector, such as Supabase. After setting
`DATABASE_URL` and `GEMINI_API_KEY` in `.env`, run:

```bash
npm run rag:migrate
npm run rag:ingest
```

`rag:migrate` creates the `knowledge_base` table and vector index.
`rag:ingest` reads `ragdata/`, embeds the chunks, and uploads them to the
database.
