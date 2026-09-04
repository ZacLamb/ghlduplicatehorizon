# GHL Duplicate Contact — Bookmarklet

Duplicates a contact in the Horizon sub-account (`NOzIY7QjqCaxRk3Scl3A`), copying
every field **except** the Work Order custom field (`contact.work_order`).

Trigger: click a bookmark in your browser's bookmarks bar while viewing a contact
(or with contacts checked on the list view). No GHL settings, Custom JS field, or
account-wide code injection involved — this is deliberately independent of that,
since it turned out unreliable to depend on in this account.

## How it works

- **`server.js`** — a small backend on Railway. Holds your GHL API token (never
  exposed to the browser) and does the actual contact read/create via the GHL API.
- **`public/widget.js`** — served by that same backend. Renders a floating
  "Duplicate This Contact" / "Duplicate Selected (N)" button and calls the backend
  when clicked.
- **`bookmarklet-install.html`** — a page with a draggable bookmark. Clicking the
  bookmark loads `widget.js` into whatever GHL page you're currently on.

## 1. Deploy the backend to Railway

- Push `server.js`, `package.json`, `.env.example`, and the `public/` folder to your
  GitHub repo (already done if you're continuing from before).
- Railway → New Project → Deploy from GitHub repo. Set env vars:
  - `GHL_API_TOKEN` — Private Integration token scoped to read/write Contacts for
    this sub-account. **Rotate any token that was ever pasted into a chat.**
  - `GHL_LOCATION_ID` = `NOzIY7QjqCaxRk3Scl3A`
  - `WORK_ORDER_FIELD_ID` = `1ApWjVRcaskJCYYYOBRM`
- Generate a public domain under Settings → Networking if you don't have one.
- Confirm it's live: visit `https://<your-railway-url>/health` — should return
  `{"ok":true}`. Also check `https://<your-railway-url>/widget.js` shows raw
  JavaScript, not a 404.

## 2. Install the bookmarklet

Open `bookmarklet-install.html` (just double-click the file — no deployment needed,
it runs entirely in your browser) and drag the blue button into your bookmarks bar.
If your bookmarks bar is hidden: Cmd+Shift+B (Mac) or Ctrl+Shift+B (Windows) to show
it in Chrome.

If dragging doesn't work in your browser, right-click the bookmarks bar → Add Page,
name it "Duplicate Contact", and paste this as the URL:

```
javascript:(function(){var d=document,s=d.createElement('script');s.src='https://<your-railway-url>/widget.js?t='+Date.now();d.head.appendChild(s);})();
```

(Replace `<your-railway-url>` with your actual domain.)

## 3. Use it

- Open a contact in the Horizon sub-account, click the bookmark. A blue "Duplicate
  This Contact" button appears bottom-right — click it, the duplicate is created and
  opens in a new tab.
- On the contacts list, check one or more boxes, click the bookmark, click "Duplicate
  Selected (N)".
- Click the bookmark again any time you navigate to a new contact/page — it needs to
  be re-triggered per page load since nothing auto-injects it.

## Sharing with a teammate

Send them the `bookmarklet-install.html` file (or just the raw `javascript:` URL
above) — same drag-to-bookmarks-bar install, no browser dev-mode, no extension
install, nothing GHL-side to configure. Works immediately.

## If the list-view button doesn't pick up contact IDs

The row/checkbox detection in `public/widget.js` (`getContactIdFromRow` /
`getSelectedContactIds`) is built against GHL's typical table markup, not verified
against your live authenticated DOM. If "Duplicate Selected" doesn't find the right
contacts, open DevTools on the list page, right-click one contact row → Inspect →
copy the outer HTML, and send it over — the selectors are easy to tighten once I can
see the real markup. The single-contact detail-page button doesn't have this risk
since it reads the ID from the URL, not the DOM.

## Updating the script later

Since `widget.js` is fetched fresh (with a cache-busting `?t=` param) every time the
bookmarklet runs, updating it is just pushing a new version to GitHub — Railway
redeploys, and the very next bookmarklet click picks up the change. No re-install
needed.

## Notes

- Your account already allows duplicate contacts (same email/phone won't get merged).
- All fields — including tags — are copied as-is except the Work Order field.
- To exclude additional fields later, add their field IDs to the filter in
  `buildClonePayload()` in `server.js`.
