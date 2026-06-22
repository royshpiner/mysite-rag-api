# MySite RAG API

Serverless backend for the MySite chat experience.

## Current Scope

This first version proves that Vercel can deploy the API and call Gemini from a
private environment variable. The RAG database layer will be added after this
deployment is working.

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
- `DATABASE_URL` later, when the RAG database layer is added
- `ALLOWED_ORIGIN` optional, for example `https://royshpiner.github.io`
