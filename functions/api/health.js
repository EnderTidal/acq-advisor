/**
 * GET /api/health
 * Health check endpoint with uptime and dependency status.
 */
export async function onRequestGet({ env }) {
  const checks = {};

  // Check Qdrant connectivity
  try {
    const start = Date.now();
    const res = await fetch(`http://${env.QDRANT_HOST}:${env.QDRANT_PORT}/collections`, {
      headers: { 'api-key': env.QDRANT_API_KEY }
    });
    checks.qdrant = { status: res.ok ? 'ok' : 'error', latencyMs: Date.now() - start };
  } catch (e) {
    checks.qdrant = { status: 'unreachable', error: e.message };
  }

  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
