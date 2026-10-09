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

async function getContact(contactId) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(`GHL get contact failed (${res.status}): ${JSON.stringify(data)}`);
  return data.contact;
}

function buildClonePayload(original) {
  const skip = new Set(EXCLUDED_FIELD_IDS);
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
  const payload = buildClonePayload(original);
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
