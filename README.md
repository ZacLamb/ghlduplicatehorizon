# GHL Duplicate Contact — Chrome Extension + Backend

Adds a real "Duplicate Contact" button inside GoHighLevel, scoped to sub-account
`NOzIY7QjqCaxRk3Scl3A` only. Duplicates every field on the contact **except** the
Work Order custom field (`contact.work_order`).

Two pieces:
- `server.js` (+ `package.json`) — small backend, deployed to Railway, holds your GHL
  API token and does the actual contact read/create.
- `extension/` — a Chrome extension (Manifest V3) that injects the button into GHL's
  pages and calls the backend.

## 1. Deploy the backend to Railway

- Push `server.js`, `package.json`, and `.env.example` to a new GitHub repo (drag/drop
  upload via the GitHub web UI works fine).
- Railway → New Project → Deploy from GitHub repo → select it. It auto-detects Node
  and runs `npm start`.
- Set these Variables in Railway:
  - `GHL_API_TOKEN` — a Private Integration token scoped to read/write Contacts for
    this sub-account. **Rotate the token you pasted earlier in chat before using it
    here** — anything typed into a chat should be treated as compromised.
  - `GHL_LOCATION_ID` = `NOzIY7QjqCaxRk3Scl3A`
  - `WORK_ORDER_FIELD_ID` = `1ApWjVRcaskJCYYYOBRM`
  - `EXTENSION_SHARED_SECRET` — optional. If you set this, also set the same value in
    `extension/background.js` (see below). It's a basic check, not real auth — anyone
    with the unpacked extension folder can read the value — but it stops randoms from
    hitting the public URL if they find it.
- Once deployed, Settings → Networking → Generate Domain if you don't already have a
  public URL. Copy it, e.g. `https://ghl-duplicate-contact-production.up.railway.app`.

## 2. Point the extension at your Railway URL

Edit two files in `extension/`:

- `manifest.json` — replace `https://YOUR-RAILWAY-URL.up.railway.app/*` in
  `host_permissions` with your real Railway URL.
- `background.js` — replace the `API_BASE` constant at the top with the same URL. If
  you set `EXTENSION_SHARED_SECRET` on Railway, also set `EXTENSION_KEY` to match.

## 3. Load the extension in Chrome

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Open GHL for this sub-account (any page under
   `.../location/NOzIY7QjqCaxRk3Scl3A/...`) — you should see a blue floating button in
   the bottom-right corner.

## How it behaves

- **On a contact detail page**: button reads "Duplicate This Contact." Click it →
  duplicates that contact → opens the new one in a new tab.
- **On the contacts list view**: the button only appears once you've checked at least
  one row, and shows "Duplicate Selected (N)." Click it → duplicates each selected
  contact.
- The button only renders on this one sub-account's pages — it's inert everywhere else
  in GHL.

## If the list-view button doesn't pick up contact IDs

I built the row/checkbox detection against GHL's typical table markup, but I can't
inspect your live authenticated GHL instance to confirm exact selectors. If clicking
"Duplicate Selected" on the list view doesn't work, open DevTools on that page,
right-click one contact row → Inspect → copy the outer HTML, and send it to me — I'll
tighten `getContactIdFromRow()` / `getSelectedContactIds()` in `content.js` to match.
The contact-detail-page button doesn't have this risk since it reads the ID from the
URL, not the DOM.

## Notes

- Your account already allows duplicate contacts (same email/phone won't get merged).
- All fields — including tags — are copied as-is except the Work Order field.
- To exclude additional fields later, add their field IDs to the filter in
  `buildClonePayload()` in `server.js`.
