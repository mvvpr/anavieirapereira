// Runs automatically on every verified Netlify Forms submission
// (event-triggered function: the file name "submission-created" is the trigger).
// Forwards the submission to the Google Apps Script that writes it to the
// leads spreadsheet and emails the alert. The script URL (with its secret
// token) lives in the LEADS_WEBHOOK_URL environment variable, not in this repo.
exports.handler = async (event) => {
  const url = process.env.LEADS_WEBHOOK_URL;
  if (!url) {
    console.error('LEADS_WEBHOOK_URL is not set');
    return { statusCode: 200, body: 'missing config' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (err) {
    console.error('Could not parse submission', err);
    return { statusCode: 200, body: 'bad body' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const text = await res.text();
    console.log('Leads sheet:', res.status, text.slice(0, 200), payload.form_name, payload.id);
  } catch (err) {
    console.error('Failed to reach leads sheet', err);
  }
  return { statusCode: 200, body: 'ok' };
};
