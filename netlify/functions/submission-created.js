// Runs automatically on every verified Netlify Forms submission
// (event-triggered function: the file name "submission-created" is the trigger).
//  1. Forwards the submission to the Google Apps Script that writes it to the
//     leads spreadsheet and emails the alert (LEADS_WEBHOOK_URL).
//  2. Sends a "Lead" event to the Meta Conversions API (META_PIXEL_ID,
//     META_CAPI_TOKEN), deduplicated with the browser pixel via event_id.
// Secrets live in Netlify environment variables, never in this public repo.
const crypto = require('crypto');

const GRAPH_VERSION = 'v25.0';
const OFFERS = {
  'agendamento': { content_name: 'Leitura de Tarot', value: 380 },
  'inscricao-oficina': { content_name: 'Oficina Tarot e Escrita', value: 600 }
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const norm = (s) => String(s || '').trim().toLowerCase();

function hashedPhone(raw) {
  const s = String(raw || '').trim();
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Numbers typed without country code: assume Brazil (DDD + number = 10-11 digits).
  if (!s.startsWith('+') && !s.startsWith('00') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }
  return sha256(digits);
}

async function sendToSheet(payload) {
  const url = process.env.LEADS_WEBHOOK_URL;
  if (!url) return console.error('LEADS_WEBHOOK_URL is not set');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  console.log('Leads sheet:', res.status, (await res.text()).slice(0, 200));
}

async function sendToMeta(payload) {
  const pixel = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token) return console.error('META_PIXEL_ID / META_CAPI_TOKEN not set');

  const offer = OFFERS[payload.form_name];
  if (!offer) return console.log('No Meta event for form', payload.form_name);
  const d = payload.data || {};

  const user_data = {
    client_ip_address: d.ip || undefined,
    client_user_agent: d.user_agent || undefined,
    fbp: d.fbp || undefined,
    fbc: d.fbc || undefined
  };
  if (d.email) user_data.em = [sha256(norm(d.email))];
  const ph = hashedPhone(d.whatsapp);
  if (ph) user_data.ph = [ph];
  const parts = norm(d.nome).split(/\s+/).filter(Boolean);
  if (parts.length) user_data.fn = [sha256(parts[0])];
  if (parts.length > 1) user_data.ln = [sha256(parts[parts.length - 1])];
  user_data.external_id = [sha256(String(payload.id))];

  const event = {
    event_name: 'Lead',
    event_time: Math.floor(new Date(payload.created_at || Date.now()).getTime() / 1000),
    event_id: d.event_id || 'netlify-' + payload.id,
    action_source: 'website',
    event_source_url: d.referrer || payload.site_url,
    user_data,
    custom_data: { content_name: offer.content_name, currency: 'BRL', value: offer.value }
  };

  const body = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events?access_token=${encodeURIComponent(token)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  console.log('Meta CAPI:', res.status, (await res.text()).slice(0, 300), event.event_id);
}

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (err) {
    console.error('Could not parse submission', err);
    return { statusCode: 200, body: 'bad body' };
  }

  const results = await Promise.allSettled([sendToSheet(payload), sendToMeta(payload)]);
  results.forEach((r) => { if (r.status === 'rejected') console.error(r.reason); });
  return { statusCode: 200, body: 'ok' };
};
