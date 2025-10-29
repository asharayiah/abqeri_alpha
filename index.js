
/**
 * Abqeri v6.7 — Turnkey Worker (Safe-AI + Hybrid + i18n provenance)
 * Routes:
 *   GET  /api/status
 *   POST /api/chat
 * Also serves /public/*
 */
export default {
  async fetch(req, env, ctx) {
    try {

      const url = new URL(req.url);
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return serveStatic("public/index.html");
      }
      if (req.method === "GET" && url.pathname.startsWith("/public/")) {
        return serveStatic(url.pathname.replace(/^\//, ""));
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        return apiStatus(req, env);
      }
      if (req.method === "POST" && url.pathname === "/api/chat") {
        return apiChat(req, env, ctx);
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return new Response("Server error: " + (err?.message || err), { status: 500 });
    }
  }
};

async function serveStatic(key) {
  try {
    const assetUrl = new URL(key, import.meta.url);
    const res = await fetch(assetUrl);
    if (!res.ok) throw new Error("Asset not found");
    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: { "content-type": contentType(key), "cache-control": "no-store" }
    });
  } catch {
    return new Response("Asset not found", { status: 404 });
  }
}
function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function applyGuardrails(latestUserText) {
  const rules = [
    { id: "self-harm", pattern: /(kill myself|suicide|self[-\s]?harm|end my life)/i,
      message: "Self-harm content detected. I can offer supportive resources and coping strategies instead." },
    { id: "violence", pattern: /(kill (him|her|them)|how to make.*bomb|stab|shoot)/i,
      message: "Violent wrongdoing detected. I won't help with harm. I can discuss safety or de-escalation." },
    { id: "illegal", pattern: /(make (drugs|meth)|bypass.*paywall|credit card generator|hack (wifi|account))/i,
      message: "Illicit activity detected. I can't assist with law-breaking. I can offer legal, ethical alternatives." },
    { id: "sexual/minors", pattern: /(sex.*(kid|minor|underage)|cp\b)/i,
      message: "Sexual content involving minors is strictly disallowed." },
    { id: "biohazard", pattern: /(anthrax|ricin|culturing pathogen|gain[-\s]?function)/i,
      message: "Hazardous bio content detected. I cannot assist with dangerous biology." },
    { id: "extremism", pattern: /(join (isis|al[-\s]?qaeda|terror)|how to build a gun)/i,
      message: "Extremist or weapon-related content detected. I won't assist with that." }
  ];
  const hits = [];
  for (const r of rules) if (r.pattern.test(latestUserText || "")) hits.push({ id: r.id, message: r.message });
  return hits.length ? { action: "restrict", hits } : { action: "allow", hits: [] };
}

function systemPrompt(guard, provenance, lang) {
  const base = `You are Mercy Safe-AI for Abqeri (lang=${lang}).
- Be helpful, concise, culturally respectful.
- Refuse content that facilitates harm, illegal acts, sexual content involving minors, biohazards, or extremist tactics.
- If refusing, be compassionate and offer legal, humane alternatives.
(Provenance) Compute path: ${provenance.hybrid ? "Hybrid (Hardware-backed)" : "Software (Workers AI fallback)"}; Model: ${provenance.model}`;
  return guard?.action === "restrict"
    ? base + `\nA user message triggered safety filters (${guard.hits.map(h=>h.id).join(", ")}). Respond with a refusal and a supportive alternative.`
    : base;
}

async function apiStatus(req, env) {
  const hybrid = req.headers.get("x-abqeri-hybrid") === "1";
  const model = env.MODEL_ID || "@cf/meta/llama-3.1-8b-instruct";
  return new Response(JSON.stringify({ hybrid, source: hybrid ? "hybrid-hardware" : "software-fallback", model }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function apiChat(req, env, ctx) {
  const model = env.MODEL_ID || "@cf/meta/llama-3.1-8b-instruct";
  const hybridHeader = req.headers.get("x-abqeri-hybrid") === "1";
  const body = await req.json().catch(()=>({}));
  const { messages = [], lang = "en" } = body;
  const latestUser = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const guard = applyGuardrails(latestUser);
  const provenance = { model, hybrid: hybridHeader };
  const sys = { role: "system", content: systemPrompt(guard, provenance, lang) };
  const inputMessages = [sys, ...messages];

  const headers = {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
    "x-guardrails": JSON.stringify({ action: guard.action, hits: guard.hits }),
    "x-provenance": JSON.stringify(provenance)
  };

  if (guard.action === "restrict") {
    const refusal = guard.hits.map(h => h.message).join(" ");
    const alt = "If you'd like, I can help with high-level safety guidance, educational resources, or lawful alternatives.";
    const meta = { meta: { guardrails: guard.hits, action: guard.action, provenance } };
    const content = `I'm here to keep you safe. ${refusal} ${alt}`;
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(JSON.stringify(meta) + "\n"));
        controller.enqueue(enc.encode(JSON.stringify({ token: content }) + "\n"));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers });
  }

  let aiStream, usedStreaming = false;
  try {
    aiStream = await env.AI.run(model, { messages: inputMessages, stream: true });
    usedStreaming = true;
  } catch {
    aiStream = await env.AI.run(model, { messages: inputMessages });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(JSON.stringify({ meta: { guardrails: [], action: "allow", provenance } }) + "\n"));
      try {
        if (usedStreaming && aiStream?.getReader) {
          const reader = aiStream.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = typeof value === "string" ? value : new TextDecoder().decode(value);
            controller.enqueue(enc.encode(JSON.stringify({ token: chunk }) + "\n"));
          }
        } else if (aiStream?.response) {
          controller.enqueue(enc.encode(JSON.stringify({ token: aiStream.response }) + "\n"));
        } else if (typeof aiStream === "string") {
          controller.enqueue(enc.encode(JSON.stringify({ token: aiStream }) + "\n"));
        } else {
          controller.enqueue(enc.encode(JSON.stringify({ token: String(aiStream) }) + "\n"));
        }
      } finally {
        controller.close();
      }
    }
  });

  ctx?.waitUntil?.(env.DB?.exec?.(`INSERT INTO api_logs (route, guardrail_action, meta) VALUES (?, ?, ?)`,
    ["/api/chat", guard.action, JSON.stringify({ lang, model, hybrid: hybridHeader })]).catch(()=>{}));

  return new Response(stream, { status: 200, headers });
}
