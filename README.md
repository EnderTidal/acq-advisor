# ACQ Advisor

A production RAG (Retrieval-Augmented Generation) business advisor built on Alex Hormozi's published frameworks from *$100M Offers* and *$100M Leads*.

**Live demo:** [joshua-tibbetts.thetelosway.com](https://joshua-tibbetts.thetelosway.com)

## Architecture

```
User Query
    │
    ▼
┌─────────────────────────────┐
│   Cloudflare Pages (Static) │
│   Minimal UI + Chat Widget  │
└──────────┬──────────────────┘
           │ POST /api/chat
           ▼
┌─────────────────────────────┐
│   Cloudflare Worker (API)   │
│   - Rate limiting (KV)      │
│   - Request instrumentation │
│   - Query embedding (Gemini)│
│   - Vector search (Qdrant)  │
│   - LLM synthesis (Claude)  │
│   - Response + metrics      │
└──────────┬──────────────────┘
           │
     ┌─────┼──────────┐
     ▼     ▼          ▼
  Gemini  Qdrant    Claude
  Embed   Vector    Sonnet
  API     Search    API
```

## Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Vanilla HTML/CSS/JS | Zero-dependency UI |
| API | Cloudflare Workers (Pages Functions) | Edge-deployed serverless backend |
| Embedding | Google Gemini `gemini-embedding-001` | Query vectorization |
| Vector DB | Qdrant (self-hosted) | Semantic retrieval over book content |
| LLM | Anthropic Claude Sonnet | Grounded response synthesis |
| Hosting | Cloudflare Pages | Global edge deployment |

## Key Engineering Decisions

**Why real vector search over keyword matching?** At ~500 chunks, keyword matching would be faster but wouldn't demonstrate retrieval tuning, embedding selection, or similarity scoring — the core skills for a RAG pipeline role. The retrieval metadata (scores, latency, chunk count) is exposed in the UI to show the pipeline working.

**Why vanilla JS over a framework?** Load time, inspectability, and the meta-message. This is a portfolio piece — the code should be readable without a build step. `view-source` is part of the demo.

**Why Claude Sonnet over Opus?** Cost-conscious model selection is a feature, not a compromise. Sonnet handles grounded Q&A well at ~10x lower cost. This demonstrates the model routing judgment the role requires.

## Metrics (visible in UI)

- Retrieval latency (ms)
- Chunks retrieved + cosine similarity scores
- LLM response latency (ms)
- Token count (input/output)
- Estimated cost per query

## Build Time

This application was built in **[X] hours** of human time. Build log in `BUILD_LOG.md`.

## Local Development

```bash
npx wrangler pages dev public --port 8788
```

## Evaluation

```bash
cd eval
python run_eval.py
```

Runs 10 golden Q&A pairs against the live API and reports retrieval accuracy + answer quality scores.

## License

MIT
