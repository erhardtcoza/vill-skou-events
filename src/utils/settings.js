// /src/utils/settings.js
export async function getSetting(env, key) {
  const r = await env.DB.prepare(`SELECT value FROM site_settings WHERE key=?1 LIMIT 1`).bind(key).first();
  return r?.value ?? null;
}
