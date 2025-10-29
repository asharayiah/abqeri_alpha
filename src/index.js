export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Static assets (use your R2/Pages/ASSETS binding if present)
    if (
      request.method === 'GET' &&
      (url.pathname === '/' ||
       url.pathname === '/workbench' ||
       url.pathname.endsWith('.html') ||
       url.pathname.startsWith('/assets/') ||
       url.pathname.startsWith('/about/') ||
       url.pathname.startsWith('/docs/'))
    ) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('OK', { status: 200 });
    }

    if (url.pathname === '/api/ai/chat' && request.method === 'POST') {
      return handleChatSSE(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function handleChatSSE(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return new Response('Bad Request', { status: 400 }); }

  const { messages = [], mode = 'General', safety = 'Moderate', lang = 'en' } = body;
  const model = env.MODEL_ID || '@cf/meta/llama-3.1-8b-instruct';

  const sys = `You are Safe-AI (Abqeri). Mode=${mode}. Safety=${safety}. Language=${lang}. Stream concise helpful tokens.`;
  const aiMessages = [{ role: 'system', content: sys }, ...messages];

  // Run Workers AI with streaming
  const aiStream = await env.AI.run(model, { messages: aiMessages, stream: true });

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send meta envelope first
      const meta = {
        meta: {
          provenance: { hybrid: false, model },
          guardrails: [
            { id: 'mode', message: mode },
            { id: 'safety', message: safety },
            { id: 'lang', message: lang }
          ]
        }
      };
      controller.enqueue(enc.encode(`data: ${JSON.stringify(meta)}\n\n`));

      const reader = aiStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // IMPORTANT: decode Uint8Array → UTF-8 text
        const text = typeof value === 'string' ? value : dec.decode(value, { stream: true });

        // Wrap as {response: "..."} per client contract
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ response: text })}\n\n`));
      }
      controller.enqueue(enc.encode(`data: [DONE]\n\n`));
      controller.close();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
