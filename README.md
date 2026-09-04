# GHL Duplicate Contact — Direct Custom JS Integration

Adds a real "Duplicate Contact" button directly inside GoHighLevel, scoped to
sub-account `NOzIY7QjqCaxRk3Scl3A` only. Duplicates every field on the contact
**except** the Work Order custom field (`contact.work_order`).

Same shape as your existing `inject.js` loader for blocking "+ Add Contact": one
`<script src="...">` tag in GHL's Custom JS field, no extension or per-person install
step required.

## 1. Deploy the backend to Railway

Already done if you're reading this after your earlier deploy — the widget script is
served from the same backend at `/widget.js`. If you're setting this up fresh:

- Push `server.js`, `package.json`, `.env.example`, and the `public/` folder (containing
  `widget.js`) to your GitHub repo.
- Railway → New Project → Deploy from GitHub repo. Set env vars:
  - `GHL_API_TOKEN` — Private Integration token scoped to read/write Contacts for this
    sub-account.
  - `GHL_LOCATION_ID` = `NOzIY7QjqCaxRk3Scl3A`
  - `WORK_ORDER_FIELD_ID` = `1ApWjVRcaskJCYYYOBRM`
- Generate a public domain under Settings → Networking if you don't have one.

## 2. Confirm the widget script is reachable

Visit `https://<your-railway-url>/widget.js` in a browser tab — you should see the raw
JavaScript, not a 404.

## 3. Add it to GHL's Custom JS field

Settings → (Agency or this sub-account's) Custom JS. Add:

```html
<script src="https://<your-railway-url>/widget.js"></script>
```

You can add this alongside your existing `inject.js` loader tag — multiple `<script>`
tags in the same field are fine, they don't conflict. The script checks the location ID
itself before doing anything, so it's safe to add at the agency level (like your
existing loader) and it'll stay inert everywhere except this one sub-account.

## How it behaves

- **On a contact detail page**: a floating blue button, bottom-right, reads "Duplicate
  This Contact." Click it → duplicates that contact → opens the new one in a new tab.
- **On the contacts list view**: the button only appears once you've checked at least
  one row, and shows "Duplicate Selected (N)."
- Navigation and selection detection are debounced/event-based rather than rescanning
  the whole page on every DOM change, so it shouldn't add noticeable load-time overhead.

## If the list-view button doesn't pick up contact IDs

The row/checkbox detection is built against GHL's typical table markup, but I can't
inspect your live authenticated GHL instance to confirm exact selectors. If clicking
"Duplicate Selected" doesn't work, open DevTools on the list page, right-click one
contact row → Inspect → copy the outer HTML, and send it to me — I'll tighten
`getContactIdFromRow()` / `getSelectedContactIds()` in `public/widget.js` to match. The
detail-page button doesn't have this risk since it reads the ID from the URL.

## Updating the script later

Since it's loaded via `<script src>` rather than pasted inline, updating it is just a
matter of pushing a new `public/widget.js` to GitHub — Railway redeploys automatically
and every page load picks up the new version. No need to touch the GHL Custom JS field
again once it's added.

## A note on exposure

Because this runs as plain client-side JavaScript, `API_BASE` and the `/api/duplicate`
endpoint are visible to anyone who views the page source — there's no way to keep a
real secret in browser-side code. The backend still holds your GHL API token
server-side (never exposed), and any call to `/api/duplicate` is scoped to contacts
that exist in your location, so the practical blast radius of someone else finding and
poking the endpoint is limited to being able to trigger contact duplication — not read
or exfiltrate broader account data. If that's a concern, it's the same tradeoff your
existing `inject.js` setup already carries.

## Notes

- Your account already allows duplicate contacts (same email/phone won't get merged).
- All fields — including tags — are copied as-is except the Work Order field.
- To exclude additional fields later, add their field IDs to the filter in
  `buildClonePayload()` in `server.js`.

---

### Chrome extension (previous approach, kept for reference)

An earlier iteration of this used a Chrome extension (`extension/` folder) instead of
direct GHL integration. It still works if you ever want a per-person install instead of
an account-wide script, but the Custom JS approach above is now the primary path.

