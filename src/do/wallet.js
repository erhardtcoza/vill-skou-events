// /src/do/wallet.js
export class WalletDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    this.key = "state";
    this.data = {
      wallet_id: null,
      balance_cents: 0,
      version: 0,
      status: "active",

      // low-balance scheduling
      pending_low_warn_ts: 0,       // epoch seconds; 0 = none
      low_warn_threshold_cents: 0,  // remember threshold used when scheduling
      last_purchase_at: 0           // shadow of last purchase time (secs)
    };

    this.loaded = false;
  }

  async _load() {
    const saved = await this.state.storage.get(this.key);
    if (saved && typeof saved === "object") {
      this.data = { ...this.data, ...saved };
    }
  }
  async _save() {
    await this.state.storage.put(this.key, this.data);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (!this.loaded) { await this._load(); this.loaded = true; }

    // ---------------------- init & read ----------------------
    if (url.pathname.endsWith("/init") && req.method === "POST") {
      const b = await req.json();
      this.data.wallet_id = b.wallet_id;
      this.data.balance_cents = b.balance_cents ?? 0;
      this.data.version = b.version ?? 0;
      this.data.status = b.status ?? "active";
      await this._save();
      return j200(this.data);
    }
    if (url.pathname.endsWith("/get") && req.method === "GET") {
      return j200(this.data);
    }

    // ---------------------- balance change -------------------
    if (url.pathname.endsWith("/topup") && req.method === "POST") {
      const { amount_cents = 0 } = await req.json();
      if (this.data.status !== "active") return jerr(409, "wallet_inactive");

      this.data.balance_cents += (amount_cents | 0);
      this.data.version++;
      await this._save();

      // Any pending low-warn becomes invalid after a top-up
      await this._cancelLowWarnInternal();

      return j200({ balance_cents: this.data.balance_cents, version: this.data.version });
    }

    if (url.pathname.endsWith("/deduct") && req.method === "POST") {
      const { amount_cents = 0, expected_version } = await req.json();
      if (this.data.status !== "active") return jerr(409, "wallet_inactive");
      if (expected_version != null && expected_version !== this.data.version) {
        return jerr(409, "version_conflict");
      }
      if ((amount_cents | 0) > this.data.balance_cents) {
        return jerr(402, "insufficient_funds");
      }

      this.data.balance_cents -= (amount_cents | 0);
      this.data.version++;
      this.data.last_purchase_at = Math.floor(Date.now() / 1000);
      await this._save();

      return j200({ balance_cents: this.data.balance_cents, version: this.data.version });
    }

    // ------------------ low-balance scheduling ----------------
    if (url.pathname.endsWith("/low-warn/schedule") && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const due_in_secs = Number(body?.due_in_secs) || 900; // default 15 min
      const threshold_cents = Number(body?.threshold_cents) || 8500;

      const nowSec = Math.floor(Date.now() / 1000);
      this.data.pending_low_warn_ts = nowSec + due_in_secs;
      this.data.low_warn_threshold_cents = threshold_cents;

      // Set alarm (ms)
      await this.state.storage.setAlarm((this.data.pending_low_warn_ts * 1000) | 0);
      await this._save();

      return j200({ ok: true, scheduled_for: this.data.pending_low_warn_ts });
    }

    if (url.pathname.endsWith("/low-warn/cancel") && req.method === "POST") {
      await this._cancelLowWarnInternal();
      return j200({ ok: true, cancelled: true });
    }

    return jerr(404, "no_route");
  }

  // ----------------------- alarm handler -----------------------
  async alarm() {
    if (!this.loaded) { await this._load(); this.loaded = true; }

    const due = Number(this.data.pending_low_warn_ts || 0);
    if (!due) return; // nothing to do

    const nowSec = Math.floor(Date.now() / 1000);
    // If we woke up too early (rare), re-arm to the due time.
    if (nowSec < due) {
      await this.state.storage.setAlarm((due * 1000) | 0);
      return;
    }

    try {
      // Re-check balance using current state in DO (fast path)
      const balance = Number(this.data.balance_cents || 0);
      const threshold = Number(this.data.low_warn_threshold_cents || 0) || 8500;
      if (!(balance < threshold)) {
        // No longer low — just clear pending
        await this._cancelLowWarnInternal();
        return;
      }

      // Fetch authoritative timestamps + recipient details from DB
      const env = this.env;
      const id = this.data.wallet_id;
      if (!id) { await this._cancelLowWarnInternal(); return; }

      const w = await env.DB.prepare(
        "SELECT name, mobile, last_purchase_at, last_low_warn_at, balance_cents FROM wallets WHERE id=?1 LIMIT 1"
      ).bind(id).first();

      if (!w || !w.mobile) { await this._cancelLowWarnInternal(); return; }

      const lastPurchaseAt = Number(w.last_purchase_at || this.data.last_purchase_at || 0);
      const lastWarnAt = Number(w.last_low_warn_at || 0);

      // Only send once per purchase: if we've already warned after this purchase, skip.
      if (lastWarnAt && lastWarnAt >= lastPurchaseAt && lastPurchaseAt > 0) {
        await this._cancelLowWarnInternal();
        return;
      }

      // Still low? If DB balance exists, prefer it for the check.
      const dbBal = Number(w.balance_cents ?? balance);
      if (!(dbBal < threshold)) {
        await this._cancelLowWarnInternal();
        return;
      }

      // Send the template using mapper (WA_TMP_BAR_LOW_BALANCE -> "bar_low_balance:af")
      const { sendTemplateByKey } = await import("../routes/whatsapp.js");
      const templateSettingKey = "WA_TMP_BAR_LOW_BALANCE";
      const tplSelRow = await env.DB.prepare(
        "SELECT value FROM site_settings WHERE key=?1 LIMIT 1"
      ).bind(templateSettingKey).first();
      const template_key = (tplSelRow?.value || "").trim();

      if (template_key) {
        await sendTemplateByKey(env, {
          template_key,
          context: "visitor",
          msisdn: normalizeMsisdn(w.mobile),
          data: { wallets: { id, name: w.name || "", mobile: w.mobile, balance_cents: dbBal } }
        });

        // Record last_low_warn_at in DB so we don't resend for the same purchase
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          "UPDATE wallets SET last_low_warn_at=?2 WHERE id=?1"
        ).bind(id, now).run();
      }

      // Clear pending regardless (sent or not)
      await this._cancelLowWarnInternal();
    } catch {
      // If anything fails, don't spam alarms repeatedly. Clear pending.
      await this._cancelLowWarnInternal();
    }
  }

  // ----------------------- private helpers -----------------------
  async _cancelLowWarnInternal() {
    this.data.pending_low_warn_ts = 0;
    this.data.low_warn_threshold_cents = this.data.low_warn_threshold_cents || 0;
    await this._save();
    // Clear alarm by setting it to null (Cloudflare clears when no future alarm exists)
    await this.state.storage.setAlarm(null);
  }
}

/* --------------- local utils for this module --------------- */
function normalizeMsisdn(msisdn) {
  const s = String(msisdn || "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.startsWith("27") && s.length >= 11) return s;
  if (s.length === 10 && s.startsWith("0")) return "27" + s.slice(1);
  return s;
}
function j200(o) {
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
function jerr(status, error) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "content-type": "application/json" }
  });
}
