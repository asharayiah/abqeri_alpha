var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var J = /* @__PURE__ */ __name((o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...h } }), "J");
var T = /* @__PURE__ */ __name((s, c = 200, h = {}) => new Response(s, { status: c, headers: { "content-type": "text/plain; charset=utf-8", ...h } }), "T");
var now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now");
function getCookie(req, name) {
  const raw = req.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
__name(getCookie, "getCookie");
function setCookie(name, val, days = 30) {
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  return `${name}=${encodeURIComponent(val)}; Path=/; SameSite=Lax; Expires=${exp}`;
}
__name(setCookie, "setCookie");
async function session(_env, req) {
  const tok = getCookie(req, "abqeri_session");
  if (!tok) return null;
  try {
    return JSON.parse(atob(tok));
  } catch {
    return null;
  }
}
__name(session, "session");
var MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `
];
async function getUserVersion(env) {
  try {
    const r = await env.abqeri_alpha.prepare("PRAGMA user_version;").all();
    const row = r?.results?.[0] || {};
    const k = Object.keys(row)[0];
    return Number(row[k] ?? 0) || 0;
  } catch {
    return 0;
  }
}
__name(getUserVersion, "getUserVersion");
async function setUserVersion(env, v) {
  await env.abqeri_alpha.exec(`PRAGMA user_version=${v};`);
}
__name(setUserVersion, "setUserVersion");
async function runMigrations(env) {
  let uv = await getUserVersion(env);
  for (let i = uv; i < MIGRATIONS.length; i++) {
    await env.abqeri_alpha.exec(MIGRATIONS[i]);
    await setUserVersion(env, i + 1);
  }
  return { applied: Math.max(0, MIGRATIONS.length - uv), version: MIGRATIONS.length };
}
__name(runMigrations, "runMigrations");
var MIGRATED = false;
async function ensureSchema(env) {
  if (MIGRATED) return;
  try {
    const exists = await env.abqeri_alpha.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").all();
    if (!exists?.results?.length) await runMigrations(env);
    else {
      await runMigrations(env);
    }
    MIGRATED = true;
  } catch (e) {
    await runMigrations(env);
    MIGRATED = true;
  }
}
__name(ensureSchema, "ensureSchema");
async function findUser(env, email) {
  await ensureSchema(env);
  return await env.abqeri_alpha.prepare(`SELECT * FROM users WHERE email=?`).bind(email).first();
}
__name(findUser, "findUser");
async function insertUser(env, email, username, password) {
  await ensureSchema(env);
  const raw = new TextEncoder().encode(password);
  const d = await crypto.subtle.digest("SHA-256", raw);
  const pass_hash = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const ts = now();
  await env.abqeri_alpha.prepare(
    `INSERT INTO users (email, username, pass_hash, role, plan, status, created_at, updated_at)
     VALUES (?, ?, ?, 'user', 'free', 'active', ?, ?)`
  ).bind(email.trim().toLowerCase(), username.trim(), pass_hash, ts, ts).run();
  return await findUser(env, email.trim().toLowerCase());
}
__name(insertUser, "insertUser");
async function checkPass(user, password) {
  const raw = new TextEncoder().encode(password);
  const d = await crypto.subtle.digest("SHA-256", raw);
  const hex = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return user.pass_hash === hex;
}
__name(checkPass, "checkPass");
async function verifyTurnstile(env, token) {
  if (env.ALLOW_FAKE_TURNSTILE === "1") return true;
  if (!token) return false;
  try {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET || "1x0000000000000000000000000000000AA");
    form.append("response", token);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const j = await r.json();
    return !!j.success;
  } catch {
    return false;
  }
}
__name(verifyTurnstile, "verifyTurnstile");
function badRequest(code) {
  return J({ ok: false, error: code }, 400);
}
__name(badRequest, "badRequest");
async function POST_register(env, req) {
  try {
    await ensureSchema(env);
    const { email, username, password, confirm, turnstile } = await req.json().catch(() => ({}));
    if (!email || !username || !password || !confirm) return badRequest("missing_fields");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return badRequest("bad_email");
    if (password !== confirm) return badRequest("password_mismatch");
    if (password.length < 8) return badRequest("weak_password");
    if (!await verifyTurnstile(env, turnstile)) return J({ ok: false, error: "captcha_failed" }, 400);
    const exists = await findUser(env, email.trim().toLowerCase());
    if (exists) return J({ ok: false, error: "email_exists" }, 409);
    const u = await insertUser(env, email, username, password);
    const tok = btoa(JSON.stringify({ uid: u.id, email: u.email, role: u.role, plan: u.plan, t: now() }));
    return J({ ok: true, redirect: "/pricing.html?from=register" }, 200, { "Set-Cookie": setCookie("abqeri_session", tok) });
  } catch (e) {
    const dev = env.ALLOW_FAKE_TURNSTILE === "1" ? { dev_hint: String(e?.message || e) } : {};
    return J({ ok: false, error: "db_error", ...dev }, 500);
  }
}
__name(POST_register, "POST_register");
async function POST_login(env, req) {
  try {
    await ensureSchema(env);
    const { email, password } = await req.json().catch(() => ({}));
    if (!email || !password) return badRequest("missing_fields");
    const u = await findUser(env, String(email).trim().toLowerCase());
    if (!u) return J({ ok: false, error: "invalid_credentials" }, 401);
    if (!await checkPass(u, password)) return J({ ok: false, error: "invalid_credentials" }, 401);
    const tok = btoa(JSON.stringify({ uid: u.id, email: u.email, role: u.role, plan: u.plan, t: now() }));
    return J({ ok: true, redirect: "/workbench?lang=en#tab=safe" }, 200, { "Set-Cookie": setCookie("abqeri_session", tok) });
  } catch (e) {
    const dev = env.ALLOW_FAKE_TURNSTILE === "1" ? { dev_hint: String(e?.message || e) } : {};
    return J({ ok: false, error: "db_error", ...dev }, 500);
  }
}
__name(POST_login, "POST_login");
async function POST_logout(_env, _req) {
  return new Response("", { status: 302, headers: { "Set-Cookie": "abqeri_session=; Path=/; Max-Age=0; SameSite=Lax", Location: "/" } });
}
__name(POST_logout, "POST_logout");
async function GET_me(env, req) {
  const s = await session(env, req);
  return J({ ok: !!s, session: s || null });
}
__name(GET_me, "GET_me");
async function gateWorkbench(env, req) {
  const u = new URL(req.url);
  if (u.pathname === "/workbench" || u.pathname === "/workbench.html") {
    const s = await session(env, req);
    if (!s) return new Response("", { status: 302, headers: { Location: "/auth/login.html?next=/workbench" } });
  }
  return null;
}
__name(gateWorkbench, "gateWorkbench");
async function GET_admin_diag(env) {
  if (env.ALLOW_FAKE_TURNSTILE !== "1") return T("Forbidden", 403);
  const version = await getUserVersion(env).catch(() => 0);
  const users = await env.abqeri_alpha.prepare("SELECT COUNT(*) AS n FROM users").all().catch(() => ({ results: [{ n: 0 }] }));
  return J({ ok: true, d1_user_version: version, users: users?.results?.[0]?.n ?? 0 });
}
__name(GET_admin_diag, "GET_admin_diag");
async function POST_admin_migrate(env) {
  if (env.ALLOW_FAKE_TURNSTILE !== "1") return T("Forbidden", 403);
  const r = await runMigrations(env);
  return J({ ok: true, applied: r.applied, version: r.version });
}
__name(POST_admin_migrate, "POST_admin_migrate");
var RULES = [
  {
    id: "violence",
    message: "Violent wrongdoing detected. I won't help with harm. I can discuss safety or de-escalation.",
    tests: [/make\s+(?:a|an)\s+(?:bomb|explosive|weapon|gun|silencer|pipe\s*bomb)/i, /\bkill(?:ing)?\b|\bmaim\b|\bassassinate\b|\bexecute\b/i]
  },
  {
    id: "cybercrime",
    message: "Harmful cyber activity detected. I can\u2019t assist. I can discuss defense and ethics instead.",
    tests: [/\b(ddos|botnet|ransomware|zero[- ]day)\b/i, /\bbypass\s+(?:2fa|mfa|license|paywall)\b/i, /\bhack(?:ing)?\b/i]
  }
];
function screenSafety(text) {
  const hits = [];
  for (const r of RULES) if (r.tests.some((rx) => rx.test(text))) hits.push({ id: r.id, message: r.message });
  return hits;
}
__name(screenSafety, "screenSafety");
var ABQ_SYSTEM = `You are Abqeri \u2014 answer with mercy, clarity, humility. Be brief and concrete; refuse harm safely; don't self-identify as an AI/model.`;
function stripIdentity(s) {
  return (s || "").replace(/\b(?:I(?:'| a)m|This is)\s+(?:an?\s+)?(?:AI|LLM|assistant|model)[^.,!?]*[.,!?]?\s*/gi, "");
}
__name(stripIdentity, "stripIdentity");
function pickToken(x) {
  if (typeof x === "string") return x;
  if (!x) return "";
  if (typeof x.response === "string") return x.response;
  if (x.delta?.content) return x.delta.content;
  if (x.choices?.[0]?.delta?.content) return x.choices[0].delta.content;
  if (typeof x.token === "string") return x.token;
  if (typeof x.text === "string") return x.text;
  return "";
}
__name(pickToken, "pickToken");
async function GET_ai_status(env, _req) {
  return J({ hybrid: false, model: env.MODEL_ID || "@cf/meta/llama-3.1-8b-instruct" });
}
__name(GET_ai_status, "GET_ai_status");
async function POST_ai_chat(env, req) {
  const { messages = [], lang = "en" } = await req.json().catch(() => ({}));
  const userText = (messages?.[messages.length - 1]?.content || "") + "";
  const guards = screenSafety(userText);
  const enc = new TextEncoder();
  const xmeta = /* @__PURE__ */ __name((action, hybrid = false) => enc.encode(JSON.stringify({ meta: { guardrails: guards, action, provenance: { model: env.MODEL_ID || "@cf/meta/llama-3.1-8b-instruct", hybrid } } }) + "\n"), "xmeta");
  if (guards.length) {
    const refusal = guards.map((g) => g.message).join(" ");
    const alt = "If you'd like, I can help with high-level safety guidance, educational resources, or lawful alternatives.";
    const text = `I'm here to keep you safe. ${refusal} ${alt}`;
    const parts2 = text.split(/(\s+)/);
    let i2 = 0;
    return new Response(new ReadableStream({ start(c) {
      c.enqueue(xmeta("restrict", false));
      const iv = setInterval(() => {
        if (i2 >= parts2.length) {
          clearInterval(iv);
          c.enqueue(enc.encode("[DONE]\n"));
          c.close();
          return;
        }
        c.enqueue(enc.encode(JSON.stringify({ token: parts2[i2++] }) + "\n"));
      }, 18);
    } }), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
  }
  const modelId = env.MODEL_ID || "@cf/meta/llama-3.1-8b-instruct";
  const final = [{ role: "system", content: ABQ_SYSTEM }, ...messages];
  try {
    if (env.AI?.run) {
      const r = await env.AI.run(modelId, { messages: final, stream: true, temperature: 0.3, max_tokens: 400, metadata: { lang } });
      const reader = typeof r?.getReader === "function" ? r.getReader() : r?.body?.getReader?.();
      if (reader) {
        let buf = "";
        const dec = new TextDecoder();
        return new Response(new ReadableStream({
          async start(c) {
            c.enqueue(xmeta("allow", false));
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let idx;
              while ((idx = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 1);
                if (!line) continue;
                let obj = null;
                try {
                  const s = line.startsWith("data:") ? line.slice(5).trim() : line;
                  obj = JSON.parse(s);
                } catch {
                  obj = line;
                }
                let t = pickToken(obj);
                if (t) {
                  t = stripIdentity(t);
                  c.enqueue(enc.encode(JSON.stringify({ token: t }) + "\n"));
                }
              }
            }
            c.enqueue(enc.encode("[DONE]\n"));
            c.close();
          }
        }), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
      }
    }
  } catch {
  }
  let out = "I can help with that. (Local demo \u2014 bind Workers AI for real-time tokens.)";
  try {
    if (env.AI?.run) {
      const full = await env.AI.run(modelId, { messages: final, temperature: 0.3, max_tokens: 400, metadata: { lang } });
      if (typeof full === "string") out = full;
      else if (typeof full?.response === "string") out = full.response;
      else if (Array.isArray(full?.choices) && full.choices[0]?.message?.content) out = full.choices[0].message.content;
    }
  } catch {
  }
  out = stripIdentity(out);
  const parts = out.split(/(\s+)/);
  let i = 0;
  return new Response(new ReadableStream({ start(c) {
    c.enqueue(xmeta("allow", false));
    const iv = setInterval(() => {
      if (i >= parts.length) {
        clearInterval(iv);
        c.enqueue(enc.encode("[DONE]\n"));
        c.close();
        return;
      }
      c.enqueue(enc.encode(JSON.stringify({ token: parts[i++] }) + "\n"));
    }, 18);
  } }), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
}
__name(POST_ai_chat, "POST_ai_chat");
async function POST_qpc_run(_env, req) {
  await req.json().catch(() => ({}));
  const shots = 512;
  const p00 = 0.49 + Math.random() * 0.02, p11 = 0.49 + Math.random() * 0.02;
  const p01 = Math.max(0, 1 - p00 - p11), p10 = 0;
  const counts = { "00": Math.round(p00 * shots), "11": Math.round(p11 * shots), "01": Math.round(p01 * shots), "10": Math.round(p10 * shots) };
  const baseline = { latency: 42 + Math.random() * 8, energy: 22 + Math.random() * 6, fidelity: 91 + Math.random() * 3 };
  const hybrid = { latency: 24 + Math.random() * 5, energy: 10 + Math.random() * 4, fidelity: 95 + Math.random() * 2 };
  return J({ ok: true, results: { counts, shots }, baseline, hybrid });
}
__name(POST_qpc_run, "POST_qpc_run");
var src_default = {
  async fetch(req, env) {
    const gated = await gateWorkbench(env, req);
    if (gated) return gated;
    const u = new URL(req.url);
    const p = u.pathname;
    const m = req.method;
    if (p === "/api/auth/register" && m === "POST") return POST_register(env, req);
    if (p === "/api/auth/login" && m === "POST") return POST_login(env, req);
    if (p === "/api/auth/logout" && m === "POST") return POST_logout(env, req);
    if (p === "/api/auth/me" && m === "GET") return GET_me(env, req);
    if (p === "/api/admin/db/diag" && m === "GET") return GET_admin_diag(env);
    if (p === "/api/admin/db/migrate" && m === "POST") return POST_admin_migrate(env);
    if (p === "/api/ai/status" && m === "GET") return GET_ai_status(env, req);
    if (p === "/api/ai/chat" && m === "POST") return POST_ai_chat(env, req);
    if (p === "/api/qpc/run" && m === "POST") return POST_qpc_run(env, req);
    try {
      return await env.ASSETS.fetch(req);
    } catch {
      return T("Not Found", 404);
    }
  }
};

// ../../Users/ashar/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../Users/ashar/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-sbLwdd/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../Users/ashar/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-sbLwdd/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
