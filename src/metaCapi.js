import fetch from 'node-fetch';

const META_URL = (pixelId) => `https://graph.facebook.com/v19.0/${pixelId}/events`;

export async function sendLeadToMeta({
  accessToken,
  pixelId,
  testEventCode,
  eventName = 'Lead',
  eventTime = Math.floor(Date.now() / 1000),
  eventId,
  userData,
  customData = {},
  actionSource = 'website'
}) {
  const payload = {
    data: [{
      event_name: eventName,
      event_time: eventTime,
      event_id: eventId,
      action_source: actionSource,
      user_data: userData,
      custom_data: customData
    }],
    // Optionally include test_event_code for Events Manager → Test Events
    ...(testEventCode ? { test_event_code: testEventCode } : {})
  };

  const url = META_URL(pixelId) + `?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!res.ok) {
    const err = new Error('Meta CAPI error');
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}