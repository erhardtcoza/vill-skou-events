  router.add("GET", "/api/admin/settings", guard(async (_req, env) => {
    const wanted = [
      "PUBLIC_BASE_URL",
      "VERIFY_TOKEN",

      // WhatsApp (stored with WA_* in DB)
      "WA_TOKEN",
      "WA_PHONE_NUMBER_ID",
      "WA_BUSINESS_ID",
      "WA_TMP_ORDER_CONFIRM",
      "WA_TMP_PAYMENT_CONFIRM",
      "WA_TMP_TICKET_DELIVERY",
      "WA_TMP_SKOU_SALES",

      // ✅ auto-reply + variable mapping
      "WA_AUTOREPLY_ENABLED",
      "WA_AUTOREPLY_TEXT",
      "WA_MAP_VAR1",
      "WA_MAP_VAR2",
      "WA_MAP_VAR3",

      // Yoco
      "YOCO_MODE",
      "YOCO_PUBLIC_KEY",
      "YOCO_SECRET_KEY",
      "YOCO_CLIENT_ID",
      "YOCO_REDIRECT_URI",
      "YOCO_REQUIRED_SCOPES",
      "YOCO_STATE",
      "YOCO_TEST_PUBLIC_KEY",
      "YOCO_TEST_SECRET_KEY",
      "YOCO_LIVE_PUBLIC_KEY",
      "YOCO_LIVE_SECRET_KEY",

      // Optional site block
      "SITE_NAME",
      "SITE_LOGO_URL",
    ];

    const out = {};
    for (const dbKey of wanted) {
      const v = await getSetting(env, dbKey);
      if (v != null) out[normalizeOutKey(dbKey)] = v;
    }
    return json({ ok: true, settings: out });
  }));
