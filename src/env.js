export function bindEnv(env) {
  return {
    DB: env.DB, KV: env.EVENTS_KV, R2: env.TICKET_R2,
    HMAC_SECRET: env.HMAC_SECRET,
    MAIL_FROM: env.MAILCHANNELS_SENDER || "tickets@villiersdorpskou.co.za",
  };
}
export async function q(db, sql, ...args) {
  return (await db.prepare(sql).bind(...args).all()).results || [];
}
export async function qi(db, sql, ...args) {
  const r = await db.prepare(sql).bind(...args).run(); return r.lastRowId;
}
