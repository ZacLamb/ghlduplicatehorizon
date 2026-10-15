import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const {
  GHL_API_TOKEN,
  GHL_LOCATION_ID = 'NOzIY7QjqCaxRk3Scl3A',
  WORK_ORDER_FIELD_ID = '1ApWjVRcaskJCYYYOBRM', // contact.work_order
  EXTRA_EXCLUDED_FIELD_IDS = '', // optional: comma-separated extra field IDs to skip
  COPY_TAGS = 'false', // tags can fire "Tag Added" workflows, so off by default
  ACCESS_KEY, // optional lightweight protection
  PORT = 3000,
} = process.env;

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

if (!GHL_API_TOKEN) {
  console.error('Missing GHL_API_TOKEN env var. Set it in Railway before deploying.');
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${GHL_API_TOKEN}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Fields never copied to the duplicate.
const EXCLUDED_FIELD_IDS = [
  WORK_ORDER_FIELD_ID,
  'nKm84bjA43r1edqok1NT', // Estimate Amount
  'IcIi2J8NJVmFC2eEyWTR', // Subtotal
  'QdPPepmKDLBbWu7nQIhT', // Tax
  'fl1Ic4t2SBeAUnNwW1kL', // Total Invoice
  'nQzodCdiXaSTYZWDGF7h', // Deposit Paid
  'ghsBX4Gw8qZCXWNx47Q0', // Balance Due
  ...EXTRA_EXCLUDED_FIELD_IDS.split(',').map((s) => s.trim()),
].filter(Boolean);

async function listCustomFields() {
  const res = await fetch(
    `${GHL_BASE}/locations/${GHL_LOCATION_ID}/customFields?model=contact`,
    { headers: ghlHeaders() }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`GHL custom fields failed (${res.status}): ${JSON.stringify(data)}`);
  return data.customFields || [];
}

// Anything invoice/payment related is excluded by NAME (so we don't need every field ID).
// Covers: Estimate Amount, Subtotal, Tax, Total Invoice, Deposit Paid, Balance Due,
// Payment Status/Date/Method, Invoice Links, Stripe Session Id, Invoice Numbers,
// Invoice to send to Prop Manage, Installer Invoice, and Work Order.
const EXCLUDED_NAME_RX =
  /invoice|stripe|payment|deposit|balance|estimate|subtotal|^\s*tax\s*$|work[\s_-]*order/i;

let excludedCache = { at: 0, ids: [], names: [] };
async function getNameExcludedFields() {
  if (Date.now() - excludedCache.at < 5 * 60 * 1000) return excludedCache;
  const fields = await listCustomFields();
  const hit = fields.filter((f) => EXCLUDED_NAME_RX.test(`${f.name || ''} ${f.fieldKey || ''}`));
  excludedCache = { at: Date.now(), ids: hit.map((f) => f.id), names: hit.map((f) => f.name) };
  console.log('Excluded by name:', excludedCache.names);
  return excludedCache;
}

async function getContact(contactId) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(`GHL get contact failed (${res.status}): ${JSON.stringify(data)}`);
  return data.contact;
}

async function buildClonePayload(original) {
  // Fail closed: if the field lookup fails, the duplicate fails rather than copying invoice data.
  const { ids } = await getNameExcludedFields();
  const skip = new Set([...EXCLUDED_FIELD_IDS, ...ids]);
  const customFields = (original.customFields || []).filter((f) => !skip.has(f.id));

  const payload = {
    locationId: original.locationId || GHL_LOCATION_ID,
    firstName: original.firstName,
    lastName: original.lastName,
    name: original.contactName || original.name,
    email: original.email,
    phone: original.phone,
    address1: original.address1,
    city: original.city,
    state: original.state,
    postalCode: original.postalCode,
    country: original.country,
    companyName: original.companyName,
    website: original.website,
    dateOfBirth: original.dateOfBirth,
    timezone: original.timezone,
    source: original.source,
    dnd: original.dnd,
    customFields,
  };

  // Tags are NOT copied by default: copying them fires "Tag Added" automations.
  // Appointments/calendar events and workflow enrollments are never copied.
  if (COPY_TAGS === 'true') payload.tags = original.tags || [];

  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined || payload[k] === null) delete payload[k];
  });
  return payload;
}

async function createContact(payload) {
  const res = await fetch(`${GHL_BASE}/contacts/`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GHL create contact failed (${res.status}): ${JSON.stringify(data)}`);
  return data.contact;
}

async function duplicateContact(contactId) {
  const original = await getContact(contactId);
  const payload = await buildClonePayload(original);
  const clone = await createContact(payload);
  return { original, clone };
}

function checkAccessKey(req, res) {
  if (!ACCESS_KEY) return true;
  if (req.header('X-Access-Key') !== ACCESS_KEY) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Access-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Diagnostic: list contact custom fields (name, id, key).
app.get('/api/fields', async (req, res) => {
  if (!checkAccessKey(req, res)) return;
  try {
    const fields = await listCustomFields();
    res.json(fields.map((f) => ({ name: f.name, id: f.id, key: f.fieldKey, dataType: f.dataType })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diagnostic: shows which fields are skipped when duplicating.
app.get('/api/excluded', async (req, res) => {
  if (!checkAccessKey(req, res)) return;
  try {
    const { names } = await getNameExcludedFields();
    res.json({ excludedByName: names, excludedIds: EXCLUDED_FIELD_IDS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/duplicate', async (req, res) => {
  if (!checkAccessKey(req, res)) return;
  const { contactId } = req.body || {};
  if (!contactId) return res.status(400).json({ success: false, error: 'Missing contactId' });
  try {
    const { clone } = await duplicateContact(contactId);
    res.json({ success: true, newContactId: clone.id, locationId: clone.locationId || GHL_LOCATION_ID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Duplicate-contact service listening on ${PORT}`));
