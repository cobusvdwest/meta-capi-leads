app.post('/api/lead', async (req, res) => {
  try {
    const {
      event_name = 'Lead',           // <-- allow Contact or Lead
      email,
      phone,
      first_name,
      last_name,
      city,
      state,
      country = 'ZA',
      zip,
      fbp,
      fbc,
      external_id,                   // RAW (unhashed)
      event_id,
      value,
      currency
    } = req.body || {};

    const userAgent = req.get('User-Agent');
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                   || req.socket?.remoteAddress;
    const referer = req.get('Referer');
    const nowSec = Math.floor(Date.now() / 1000);

    // --- fbc sanity (do NOT modify case or content; just validate) ---
    let fbcSanitized = fbc || undefined;
    let fbcCreation = null;
    // Expected format: fb.1.<creation>.<fbclid>
    const fbcMatch = typeof fbcSanitized === 'string'
      ? fbcSanitized.match(/^fb\.1\.(\d+)\.(.+)$/)
      : null;
    if (fbcMatch) {
      fbcCreation = parseInt(fbcMatch[1], 10);
      // If creation is way in the future (>5 minutes), drop fbc for this event
      if (Number.isFinite(fbcCreation) && fbcCreation > nowSec + 300) {
        req.log.warn({ fbcCreation, nowSec, fbc: fbcSanitized }, 'Dropping fbc with future creation_time');
        fbcSanitized = undefined;
      }
    } else if (fbcSanitized) {
      req.log.warn({ fbc: fbcSanitized }, 'Dropping fbc with invalid format');
      fbcSanitized = undefined;
    }

    // --- user_data (hash only the PII that Meta expects hashed) ---
    const userData = {
      em: hashIf(email, normalizeEmail),
      ph: hashIf(phone, normalizePhone),
      fn: hashIf(first_name, normalizeText),
      ln: hashIf(last_name, normalizeText),
      ct: hashIf(city, normalizeText),
      st: hashIf(state, normalizeText),
      country: hashIf(country, normalizeText),
      zp: hashIf(zip, normalizeText),
      client_user_agent: userAgent,
      client_ip_address: clientIp,
      fbp: fbp || undefined,          // RAW
      fbc: fbcSanitized,              // RAW (possibly dropped above)
      external_id: external_id || undefined  // RAW (unhashed)
    };
    Object.keys(userData).forEach(k => (userData[k] == null) && delete userData[k]);

    // --- Only include valid value/currency ---
    let customData = {};
    const currencyOk = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency.toUpperCase());
    const valueOk = typeof value === 'number' && isFinite(value);
    if (valueOk && currencyOk) {
      customData.value = value;
      customData.currency = currency.toUpperCase();
    }
    // else: omit both to avoid Diagnostics

    req.log.info({
      event_name,
      event_id,
      fbp_present: Boolean(userData.fbp),
      fbc_present: Boolean(userData.fbc),
      external_id_present: Boolean(userData.external_id),
      custom_value: customData.value ?? null,
      custom_currency: customData.currency ?? null
    }, 'CAPI lead/contact incoming');

    const resp = await sendLeadToMeta({
      accessToken: META_ACCESS_TOKEN,
      pixelId: META_PIXEL_ID,
      testEventCode: META_TEST_EVENT_CODE,
      eventName: event_name,                  // <-- dynamic
      eventTime: nowSec,                      // server-side event_time
      eventId: event_id,                      // MUST match pixel eventID
      actionSource: 'website',
      eventSourceUrl: referer,                // optional but good
      userData,
      customData
    });

    res.json({ ok: true, meta: resp });
  } catch (err) {
    req.log?.error({ err }, 'Lead/Contact forwarding failed');
    res.status(err.status || 500).json({
      ok: false,
      error: err.message,
      details: err.details || null
    });
  }
});
