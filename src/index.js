// src/index.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API routes first
    if (url.pathname === '/api/ai/chat' && request.method === 'POST') {
      return handleAIChat(request, env);
    }

    // Everything else -> static assets
    const resp = await env.ASSETS.fetch(request);

    // Add CSP & security headers for HTML
    const ctype = resp.headers.get('Content-Type') || '';
    if (ctype.includes('text/html')) {
      const headers = new Headers(resp.headers);
      // Strong CSP: blocks inline scripts; allows our own JS/CSS/images and XHR
      headers.set(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'", // allow inline <style> only
          "img-src 'self' data:",
          "connect-src 'self'",               // XHR/SSE to our origin only
          "font-src 'self' data:",
          "base-uri 'none'",
          "frame-ancestors 'none'"
        ].join('; ')
      );
      headers.set('X-Frame-Options', 'DENY');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), interest-cohort=()'
      );
      return new Response(resp.body, { status: resp.status, headers });
    }

    return resp;
  }
};

/**
 * POST /api/ai/chat
 * Body: { messages: [{role, content}...], mode, safety, lang }
 * Streams SSE: meta header, then {response:"..."} token chunks, ending with [DONE]
 */
async function handleAIChat(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: 'bad_request', note: 'Invalid JSON' }, 400);
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const mode     = (payload?.mode || 'General') + '';
  const safety   = (payload?.safety || 'Moderate') + '';
  const lang     = (payload?.lang || 'en') + '';

  if (!messages.length) {
    return json({ error: 'bad_request', note: 'messages[] required' }, 400);
  }

  const model = env.MODEL_ID || '@cf/meta/llama-3.1-8b-instruct';

  // Try native Workers AI streaming first
  try {
    // Attach light “guardrails” as system preface (keeps your UI meta consistent)
    const sys = [
      `Mode=${mode}`,
      `Safety=${safety}`,
      `Lang=${lang}`,
      'Answer concisely; stream tokens.'
    ].join(' | ');

    const reqMessages = normalizeMessages(messages, sys);

    // Native streaming run (Workers AI)
    const aiResp = await env.AI.run(model, {
      messages: reqMessages,
      stream: true
    });

    // If Workers AI returns a Response, forward the body (SSE) as-is
    // Wrangler local/prod both support this pattern.
    const headers = sseHeaders();
    // Ensure no buffering and correct mimetype
    return new Response(aiResp.body, { status: 200, headers });
  } catch (e) {
    // If streaming run fails (e.g., credentials/usage), gracefully fall back
    // to a single JSON completion emitted as SSE so your UI still renders.
    const text = await nonStreamingCompletion(env, model, messages, mode, safety, lang)
      .catch(() => 'Sorry—service is temporarily unavailable.');

    // Emit a minimal, well-formed SSE sequence compatible with your UI
    const stream = new ReadableStream({
      start(controller) {
        const enc = (obj) => controller.enqueue(encodeSSE(obj));
        // meta
        enc({ meta: {
          provenance: { hybrid: false, model },
          guardrails: [
            { id: 'mode',   message: mode },
            { id: 'safety', message: safety },
            { id: 'lang',   message: lang }
          ]
        }});
        // tokens (chunk the string a bit for UX)
        const chunks = chunkString(text, 64);
        for (const c of chunks) enc({ response: c });
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: sseHeaders() });
  }
}

/* -------------------------- helpers -------------------------- */

function sseHeaders() {
  const h = new Headers();
  h.set('Content-Type', 'text/event-stream; charset=utf-8');
  h.set('Cache-Control', 'no-cache, no-transform');
  h.set('X-Accel-Buffering', 'no');
  return h;
}

function encodeSSE(obj) {
  const line = 'data: ' + JSON.stringify(obj) + '\n\n';
  return new TextEncoder().encode(line);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function normalizeMessages(userMessages, systemPreface) {
  // Ensure first message is system (Workers AI respects OpenAI-style "system")
  const msgs = [];
  msgs.push({ role: 'system', content: systemPreface });
  for (const m of userMessages) {
    const role = (m?.role === 'assistant' || m?.role === 'system') ? m.role : 'user';
    const content = (m?.content ?? '') + '';
    msgs.push({ role, content });
  }
  return msgs;
}

async function nonStreamingCompletion(env, model, messages, mode, safety, lang) {
  // One-shot completion for fallback path
  const sys = `Mode=${mode} | Safety=${safety} | Lang=${lang} | Be concise.`;
  const reqMessages = normalizeMessages(messages, sys);
  const r = await env.AI.run(model, { messages: reqMessages });
  // Workers AI JSON shape: { response: "...", ... } (depends on model)
  const txt = r?.response || r?.result || '';
  return (txt || '').toString();
}

function chunkString(s, size) {
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}
