// EDIT THIS after you deploy to Railway:
const API_BASE = 'https://YOUR-RAILWAY-URL.up.railway.app';

// OPTIONAL: only set this if you also set EXTENSION_SHARED_SECRET on the Railway service.
// Leave as '' if you didn't configure that env var.
const EXTENSION_KEY = '';

async function duplicateOne(contactId) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (EXTENSION_KEY) headers['X-Extension-Key'] = EXTENSION_KEY;

    const res = await fetch(`${API_BASE}/api/duplicate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ contactId }),
    });
    const data = await res.json();
    return { contactId, ...data };
  } catch (err) {
    return { contactId, success: false, error: err.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'DUPLICATE_CONTACTS' && Array.isArray(msg.contactIds)) {
    (async () => {
      const results = [];
      for (const contactId of msg.contactIds) {
        // sequential, so we don't hammer the GHL API if multiple are selected
        results.push(await duplicateOne(contactId));
      }
      sendResponse({ results });
    })();
    return true; // keep the message channel open for the async sendResponse
  }
});
