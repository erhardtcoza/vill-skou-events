const enc = (s) => new TextEncoder().encode(s);
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc(secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc(msg));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function buildPayload(kind, id, expISO, nonce) {
  return `skou.v1|type:${kind}|id:${id}|exp:${expISO}|nonce:${nonce}`;
}
export async function signPayload(secret, base) {
  const sig = await hmacHex(secret, base);
  return `${base}|sig:${sig}`;
}
export async function verifyPayload(secret, qr) {
  const parts = Object.fromEntries(qr.split("|").slice(1).map(kv => kv.split(":")));
  const { type, id, exp, nonce, sig } = parts;
  if (!type || !id || !exp || !sig) return { ok:false, error:"Malformed" };
  const base = `skou.v1|type:${type}|id:${id}|exp:${exp}|nonce:${nonce}`;
  const expected = await hmacHex(secret, base);
  if (expected !== sig) return { ok:false, error:"Bad signature" };
  if (Date.now() > Date.parse(exp)) return { ok:false, error:"Expired" };
  return { ok:true, type, id: Number(id) };
}
export const isoPlusDays = (days) => new Date(Date.now() + days*86400000).toISOString();
export const rand = () => crypto.getRandomValues(new Uint8Array(8)).reduce((a,b)=>a+("0"+b.toString(16)).slice(-2),"");
