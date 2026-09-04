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
  GHL_LOCATION_ID,
  WORK_ORDER_FIELD_ID = '1ApWjVRcaskJCYYYOBRM', // contact.work_order
  EXTENSION_SHARED_SECRET, // optional lightweight protection, see README
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

async function getContact(contactId) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    headers: ghlHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GHL get contact failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.contact;
}

function buildClonePayload(original) {
  // Copy every custom field except Work Order.
  const customFields = (original.customFields || []).filter(
    (f) => f.id !== WORK_ORDER_FIELD_ID
  );

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
    tags: original.tags || [],
    customFields,
  };

  // Strip undefined/null so we don't send empty overwrites to GHL.
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
  if (!res.ok) {
    throw new Error(`GHL create contact failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.contact;
}

async function duplicateContact(contactId) {
  const original = await getContact(contactId);
  const payload = buildClonePayload(original);
  const clone = await createContact(payload);
  return { original, clone };
}

function checkExtensionKey(req, res) {
  if (!EXTENSION_SHARED_SECRET) return true; // no protection configured, allow
  const key = req.header('X-Extension-Key');
  if (key !== EXTENSION_SHARED_SECRET) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

// CORS: allow the extension's background worker / any origin to call this JSON API.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Extension-Key');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Called by the Chrome extension when the "Duplicate Contact" button is clicked.
app.post('/api/duplicate', async (req, res) => {
  if (!checkExtensionKey(req, res)) return;

  const { contactId } = req.body || {};
  if (!contactId) {
    return res.status(400).json({ success: false, error: 'Missing contactId' });
  }

  try {
    const { clone } = await duplicateContact(contactId);
    res.json({
      success: true,
      newContactId: clone.id,
      locationId: clone.locationId || GHL_LOCATION_ID,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Duplicate-contact service listening on ${PORT}`));
