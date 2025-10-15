// /src/do/wallet.js
export class WalletDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.key = "state";
    this.data = { wallet_id: null, balance_cents: 0, version: 0, status: "active" };
  }

  async _load() { this.data = (await this.state.storage.get(this.key)) || this.data; }
  async _save() { await this.state.storage.put(this.key, this.data); }

  async fetch(req) {
    const url = new URL(req.url);
    if (!this.loaded) { await this._load(); this.loaded = true; }

    // init / inspect
    if (url.pathname.endsWith("/init") && req.method === "POST") {
      const b = await req.json();
      this.data.wallet_id = b.wallet_id;
      this.data.balance_cents = b.balance_cents ?? 0;
      this.data.version = b.version ?? 0;
      this.data.status = b.status ?? "active";
      await this._save();
      return j200(this.data);
    }
    if (url.pathname.endsWith("/get") && req.method === "GET") return j200(this.data);

    // add funds
    if (url.pathname.endsWith("/topup") && req.method === "POST") {
      const { amount_cents = 0 } = await req.json();
      if (this.data.status !== "active") return jerr(409, "wallet_inactive");
      this.data.balance_cents += (amount_cents | 0);
      this.data.version++;
      await this._save();
      return j200({ balance_cents: this.data.balance_cents, version: this.data.version });
    }

    // deduct (with optimistic concurrency)
    if (url.pathname.endsWith("/deduct") && req.method === "POST") {
      const { amount_cents = 0, expected_version } = await req.json();
      if (this.data.status !== "active") return jerr(409, "wallet_inactive");
      if (expected_version != null && expected_version !== this.data.version) {
        return jerr(409, "version_conflict");
      }
      if ((amount_cents | 0) > this.data.balance_cents) return jerr(402, "insufficient_funds");
      this.data.balance_cents -= (amount_cents | 0);
      this.data.version++;
      await this._save();
      return j200({ balance_cents: this.data.balance_cents, version: this.data.version });
    }

    return jerr(404, "no_route");
  }
}

function j200(o) { return new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } }); }
function jerr(s, e) { return new Response(JSON.stringify({ ok: false, error: e }), { status: s, headers: { "content-type": "application/json" } }); }
