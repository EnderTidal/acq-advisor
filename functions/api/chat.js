/**
 * POST /api/chat
 * RAG-powered business advisor using Hormozi's published frameworks.
 * Pipeline: embed query → vector search (Qdrant) → synthesize (Claude) → respond with metrics
 */

const SYSTEM_PROMPT = `You are a business advisor grounded in Alex Hormozi's published frameworks from "$100M Offers" and "$100M Leads."

RULES:
- Answer ONLY from the provided context chunks. If the context doesn't contain relevant information, say "That's outside the scope of Hormozi's published frameworks I have access to."
- Never invent quotes, statistics, or frameworks not in the context.
- Be direct and actionable. Hormozi's style is blunt, practical, no fluff.
- When referencing a concept, name the source book.
- Keep responses concise (3-5 sentences) unless the user asks to elaborate.
- If asked about topics outside business/offers/leads, redirect: "I'm focused on Hormozi's business frameworks. Ask me about offers, pricing, lead generation, or scaling."

CONTEXT CHUNKS:
{context}`;

async function embedQuery(text, geminiKey) {
  const start = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] }
      })
    }
  );
  const data = await res.json();
  if (!data.embedding) throw new Error('Embedding failed: ' + JSON.stringify(data));
  return { vector: data.embedding.values, latencyMs: Date.now() - start };
}

async function searchQdrant(vector, env, limit = 5) {
  const start = Date.now();
  const body = JSON.stringify({ vector, limit, with_payload: true });
  const res = await fetch(
    `http://${env.QDRANT_HOST}:${env.QDRANT_PORT}/collections/knowledge_base/points/search`,
    {
      method: 'POST',
      headers: {
        'api-key': env.QDRANT_API_KEY,
        'Content-Type': 'application/json'
      },
      body
    }
  );
  const data = await res.json();
  return {
    results: (data.result || []).map(r => ({
      text: r.payload?.text || '',
      source: r.payload?.source || 'unknown',
      score: Math.round(r.score * 1000) / 1000
    })),
    latencyMs: Date.now() - start
  };
}

async function generateResponse(messages, context, anthropicKey) {
  const start = Date.now();
  const systemPrompt = SYSTEM_PROMPT.replace('{context}', context);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.slice(-10)
    })
  });

  const data = await res.json();
  const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response.';
  const usage = data.usage || {};

  return {
    reply,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    latencyMs: Date.now() - start
  };
}

export async function onRequestPost({ request, env }) {
  // CORS
  const origin = request.headers.get('Origin') || '';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    const { messages } = await request.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages array required' }), { status: 400, headers });
    }

    const userQuery = messages[messages.length - 1]?.content || '';
    if (!userQuery.trim()) {
      return new Response(JSON.stringify({ error: 'empty query' }), { status: 400, headers });
    }

    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const hour = new Date().toISOString().slice(0, 13);
    const rateKey = `rate:${ip}:${hour}`;

    if (env.RATE_KV) {
      const count = parseInt(await env.RATE_KV.get(rateKey) || '0');
      if (count >= 30) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded. Try again in an hour.',
          metrics: { rateLimited: true }
        }), { status: 429, headers });
      }
      await env.RATE_KV.put(rateKey, String(count + 1), { expirationTtl: 3600 });
    }

    const pipelineStart = Date.now();

    // Step 1: Embed the query
    const embedding = await embedQuery(userQuery, env.GEMINI_API_KEY);

    // Step 2: Vector search
    const search = await searchQdrant(embedding.vector, env);

    // Filter to Hormozi-relevant content (score > 0.65)
    const relevant = search.results.filter(r => r.score > 0.65);
    const context = relevant.map((r, i) =>
      `[Chunk ${i + 1} | score: ${r.score}]\n${r.text}`
    ).join('\n\n---\n\n');

    // Step 3: Generate response
    const generation = await generateResponse(messages, context || 'No relevant context found.', env.ANTHROPIC_API_KEY);

    // Cost estimation (approximate)
    const inputCost = (generation.inputTokens / 1000) * 0.003;
    const outputCost = (generation.outputTokens / 1000) * 0.015;
    const totalCost = Math.round((inputCost + outputCost) * 10000) / 10000;

    return new Response(JSON.stringify({
      reply: generation.reply,
      metrics: {
        totalLatencyMs: Date.now() - pipelineStart,
        embedding: { latencyMs: embedding.latencyMs },
        retrieval: {
          latencyMs: search.latencyMs,
          chunksSearched: search.results.length,
          chunksUsed: relevant.length,
          scores: relevant.map(r => r.score)
        },
        generation: {
          latencyMs: generation.latencyMs,
          inputTokens: generation.inputTokens,
          outputTokens: generation.outputTokens,
          model: 'claude-sonnet-4-20250514',
          estimatedCost: `$${totalCost}`
        }
      }
    }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Internal error',
      detail: err.message
    }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
