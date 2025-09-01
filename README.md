[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/erhardtcoza/vill-skou-events)



villiersdorp-events/
├─ wrangler.toml
├─ schema.sql
└─ src/
   ├─ index.js                 # Worker entry: router + static UI mounts
   ├─ router.js                # Tiny HTTP router
   ├─ env.js                   # Bindings + helpers
   ├─ utils/
   │  ├─ hmac.js               # HMAC sign/verify for QR
   │  └─ http.js               # JSON / error helpers, CORS
   ├─ services/
   │  ├─ events.js             # CRUD events + ticket types
   │  ├─ orders.js             # Checkout, POS order, ticket issuing
   │  ├─ tickets.js            # Ticket/pass queries
   │  ├─ scan.js               # IN/OUT + dwell + gender prompt logic
   │  └─ vendors.js            # Vendors, passes
   ├─ routes/
   │  ├─ public.js             # /api/public/*
   │  ├─ admin.js              # /api/admin/*
   │  ├─ pos.js                # /api/pos/*
   │  ├─ scan.js               # /api/scan
   │  └─ sync.js               # /api/sync/*
   └─ ui/
      ├─ landing.js            # /
      ├─ admin.js              # /admin (Events, Ticket Types, Gates, Vendors)
      ├─ shop.js               # /shop/:slug (public checkout)
      ├─ pos.js                # /pos (gate sales + cash-up)
      └─ scanner.js            # /scan (IN/OUT + prompts, offline queue)
