// /src/utils/auth.js
import { bad, json } from "./http.js";

/** Create/verify a signed cookie:
 * value = btoa(JSON.stringify({role,name,ts})) + "." + hmac(value)
 */

async function hmacSHA256(key, msg) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  const b = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,"0")).join("");
  return b;
}

export async function signSession(env, data) {
  const msg = btoa(JSON.stringify(data));
  const sig = await hmacSHA256(env.HMAC_SECRET || "dev-secret", msg);
  return `${msg}.${sig}`;
}

export async function verifySession(env, cookieValue) {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [msg, sig] = cookieValue.split(".");
  const expect = await hmacSHA256(env.HMAC_SECRET || "dev-secret", msg);
  if (sig !== expect) return null;
  try {
    const data = JSON.parse(atob(msg));
    // optional: 36h expiry
    const maxAgeMs = 36 * 3600 * 1000;
    if (!data.ts || (Date.now() - data.ts) > maxAgeMs) return null;
    return data; // {role, name, ts}
  } catch { return null; }
}

export function getCookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.split(/;\s*/).find(x => x.startsWith(name+"="));
  return m ? decodeURIComponent(m.split("=")[1]) : "";
}

export function setCookie(name, value, { maxAgeSec = 36*3600 } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    // NOTE: Browsers require a secure context for `Secure`; enable when on https custom domain:
    "Secure"
  ];
  return parts.join("; ");
}

/** Guard a route (UI or API) by role */
export function requireRole(role, handler) {
  return async (req, env, ctx, params) => {
    const sessRaw = getCookie(req, "vs_sess");
    const sess = await verifySession(env, sessRaw);
    if (!sess || sess.role !== role) {
      if (req.headers.get("accept")?.includes("text/html")) {
        // For UI pages, redirect to role-specific login
        const to = role === "admin" ? "/admin/login"
               : role === "pos"   ? "/pos/login"
               : "/scan/login";
        return new Response("", { status: 302, headers: { "Location": to }});
      }
      return bad("Unauthorized", 401);
    }
    return handler(req, env, ctx, params, sess);
  };
}

/** Optional: allow multiple roles */
export function requireAny(roles, handler) {
  return async (req, env, ctx, params) => {
    const sessRaw = getCookie(req, "vs_sess");
    const sess = await verifySession(env, sessRaw);
    if (!sess || !roles.includes(sess.role)) return bad("Unauthorized", 401);
    return handler(req, env, ctx, params, sess);
  };
}