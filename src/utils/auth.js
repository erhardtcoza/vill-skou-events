// /src/utils/auth.js
import { bad } from "./http.js";

/** HMAC for session cookie */
async function hmacSHA256(key, msg) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

/** Password hashing: SHA-256 over `${salt}:${password}:${pepper}` */
async function sha256(s) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function b64(b) {
  return btoa(String.fromCharCode(...b));
}
function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return b64(a);
}
export async function hashPassword(env, password, salt) {
  const pepper = env.HMAC_SECRET || "dev-pepper";
  return await sha256(`${salt}:${password}:${pepper}`);
}
export async function verifyPassword(env, password, salt, hash) {
  const h = await hashPassword(env, password, salt);
  return h === hash;
}

/** Session cookie */
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
    const maxAgeMs = 36 * 3600 * 1000;
    if (!data.ts || (Date.now() - data.ts) > maxAgeMs) return null;
    return data; // {user_id, role, name, ts}
  } catch { return null; }
}
export function getCookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.split(/;\s*/).find(x => x.startsWith(name+"="));
  return m ? decodeURIComponent(m.split("=")[1]) : "";
}
export function setCookie(name, value, { maxAgeSec = 36*3600 } = {}) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    "Secure"
  ].join("; ");
}

/** Guards */
export function requireRole(role, handler) {
  return async (req, env, ctx, params) => {
    const sessRaw = getCookie(req, "vs_sess");
    const sess = await verifySession(env, sessRaw);
    if (!sess || sess.role !== role) {
      if (req.headers.get("accept")?.includes("text/html")) {
        const to = role === "admin" ? "/admin/login" : role === "pos" ? "/pos/login" : "/scan/login";
        return new Response("", { status: 302, headers: { Location: to } });
      }
      return bad("Unauthorized", 401);
    }
    return handler(req, env, ctx, params, sess);
  };
}
export function requireAny(roles, handler) {
  return async (req, env, ctx, params) => {
    const sessRaw = getCookie(req, "vs_sess");
    const sess = await verifySession(env, sessRaw);
    if (!sess || !roles.includes(sess.role)) return bad("Unauthorized", 401);
    return handler(req, env, ctx, params, sess);
  };
}

/** Helpers for users CRUD */
export function newSalt() { return randomSalt(); }
