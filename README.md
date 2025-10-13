# Meta CAPI Lead Forwarder (Node/Express)

A tiny server that accepts **lead** form submissions from your landing page and forwards them to **Meta's Conversions API (CAPI)**. It includes hashing for PII, event deduplication, and support for `fbp`/`fbc` identifiers.

## What you get
- `POST /api/lead` endpoint that sends a `Lead` event to Meta CAPI
- SHA-256 hashing for emails/phones/etc. per Meta requirements
- Automatic capture of client IP and User-Agent (for better matching)
- Support for `event_id` to deduplicate with Pixel events
- `fbp` and `fbc` support (from cookies / query string via front-end snippet)
- Optional `META_TEST_EVENT_CODE` for Meta Test Events Tool
- CORS, Helmet, and basic rate limiting

## Quick start

1) **Clone** or push these files to a new GitHub repo.

2) **Install**:
```bash
npm install
```

3) **Configure** your `.env` (create from `.env.example`):
```
META_ACCESS_TOKEN=YOUR_LONG_LIVED_ACCESS_TOKEN
META_PIXEL_ID=YOUR_PIXEL_ID
# Optional, for Test Events Tool
META_TEST_EVENT_CODE=TEST1234
APP_PORT=3000
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

> Get a **long-lived access token** in Events Manager → Data Sources → Your Pixel → Settings → Conversions API → Generate access token.

4) **Run**:
```bash
npm run dev
```
Server runs on `http://localhost:3000` by default.

5) **Send a test** (replace placeholders as needed):
```bash
curl -X POST http://localhost:3000/api/lead   -H "Content-Type: application/json"   -H "User-Agent: test-agent"   -d '{
    "email":"test@example.com",
    "phone":" +27 82 123 4567 ",
    "first_name":"Cobus",
    "last_name":"Pieterse",
    "city":"Pretoria",
    "country":"ZA",
    "event_id":"lead-1234",
    "fbp":"fb.1.1690000000.1234567890",
    "fbc":"fb.1.1690000000.AbCdEf",
    "value":0,
    "currency":"ZAR"
  }'
```

You should see a JSON response from Meta with `events_received: 1` if everything is wired up correctly. If you set `META_TEST_EVENT_CODE`, open **Events Manager → Test Events** to confirm the event.

---

## Front-end example (vanilla JS)

Include this on your landing page (replace `API_BASE` with your server URL). It:
- reads `_fbp` / `_fbc` cookies (or builds `_fbc` from `fbclid` if present)
- generates an `event_id` for dedup
- posts the lead to your server

```html
<script>
  const API_BASE = "http://localhost:3000"; // your deploy URL

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function getQueryParam(param) {
    const p = new URLSearchParams(window.location.search);
    return p.get(param);
  }

  function getFbp() {
    return getCookie('_fbp'); // e.g. "fb.1.1690000000.1234567890"
  }

  function getFbc() {
    // Prefer cookie, otherwise build from fbclid
    const fbcCookie = getCookie('_fbc');
    if (fbcCookie) return fbcCookie;
    const fbclid = getQueryParam('fbclid');
    if (fbclid) {
      // Build fbc per Meta's guidance: fb.1.<ts>.<fbclid>
      const ts = Math.floor(Date.now() / 1000);
      return `fb.1.${ts}.${fbclid}`;
    }
    return null;
  }

  function genEventId() {
    return 'lead-' + Math.random().toString(36).slice(2) + '-' + Date.now();
  }

  async function submitLeadForm(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      email: form.email.value,
      phone: form.phone.value,
      first_name: form.first_name.value,
      last_name: form.last_name.value,
      city: form.city.value,
      country: form.country.value || "ZA",
      value: 0,
      currency: "ZAR",
      event_id: genEventId(),
      fbp: getFbp(),
      fbc: getFbc()
    };
    try {
      const res = await fetch(`${API_BASE}/api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });
      const json = await res.json();
      console.log("CAPI response:", json);
      alert("Thanks! We'll be in touch.");
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again.");
    }
  }
</script>

<form onsubmit="submitLeadForm(event)">
  <input name="first_name" placeholder="First name" required />
  <input name="last_name" placeholder="Last name" required />
  <input name="email" type="email" placeholder="Email" required />
  <input name="phone" placeholder="Phone" required />
  <input name="city" placeholder="City" />
  <input name="country" placeholder="Country" value="ZA" />
  <button type="submit">Get a quote</button>
</form>
```

---

## Deploying

You can deploy anywhere Node runs (Render, Railway, Fly.io, AWS, GCP, Azure, Vercel functions, etc.).
- Make sure your `ALLOWED_ORIGINS` env var includes your landing page origin to enable CORS.
- Use HTTPS in production.
- Keep the access token secret (never expose it client-side).

---

## POPIA / GDPR notes (not legal advice)

- Capture explicit consent on your form for marketing and analytics tracking.
- Hash PII before sending to Meta as done here.
- Provide a privacy notice explaining data handling and how to opt out.
- Respect "Do Not Track" and cookie preferences where applicable.

---

## Files

- `server.js` — Express server and `/api/lead` route
- `src/metaCapi.js` — Meta CAPI request builder/sender
- `src/hash.js` — SHA-256 hashing & normalization helpers
- `.env.example` — environment variables
- `package.json` — scripts & deps
- `Dockerfile` — optional containerization
- `vercel.json` — optional serverless config (builds an API route using Express via `vercel dev`)