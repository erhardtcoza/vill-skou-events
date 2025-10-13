// /src/do/wallet.js
export class WalletDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.data = { balance_cents: 0, version: 0, status: 'active', wallet_id: null };
  }

  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const key = 'state';
    if (!this.loaded) {
      this.data = await this.state.storage.get(key) || this.data;
      this.loaded = true;
    }

    if (url.pathname.endsWith('/init') && method === 'POST') {
      const body = await req.json();
      this.data.wallet_id = body.wallet_id;
      this.data.balance_cents = body.balance_cents ?? 0;
      this.data.version = body.version ?? 0;
      this.data.status = body.status ?? 'active';
      await this.state.storage.put(key, this.data);
      return json200(this.data);
    }

    if (url.pathname.endsWith('/get') && method === 'GET') {
      return json200(this.data);
    }

    if (url.pathname.endsWith('/topup') && method === 'POST') {
      const { amount_cents } = await req.json();
      if (this.data.status !== 'active') return bad(409, 'wallet_not_active');
      this.data.balance_cents += amount_cents|0;
      this.data.version++;
      await this.state.storage.put(key, this.data);
      return json200({ balance_cents: this.data.balance_cents, version: this.data.version });
    }

    if (url.pathname.endsWith('/deduct') && method === 'POST') {
      const { amount_cents, expected_version } = await req.json();
      if (this.data.status !== 'active') return bad(409, 'wallet_not_active');
      if (expected_version != null && expected_version !== this.data.version) {
        return bad(409, 'version_conflict');
      }
      if (amount_cents > this.data.balance_cents) return bad(402, 'insufficient_funds');
      this.data.balance_cents -= amount_cents|0;
      this.data.version++;
      await this.state.storage.put(key, this.data);
      return json200({ balance_cents: this.data.balance_cents, version: this.data.version });
    }

    return bad(404, 'no_route');
  }
}

function json200(obj){ return new Response(JSON.stringify(obj), {status:200, headers:{'content-type':'application/json'}}); }
function bad(code,msg){ return new Response(JSON.stringify({ok:false,error:msg}), {status:code, headers:{'content-type':'application/json'}}); }
