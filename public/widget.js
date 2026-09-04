(() => {
  const TARGET_LOCATION_ID = 'NOzIY7QjqCaxRk3Scl3A';

  // Prevent double-injection if the bookmarklet is clicked more than once.
  if (window.__ghlDupContactWidgetLoaded) return;
  window.__ghlDupContactWidgetLoaded = true;

  function getLocationIdFromUrl() {
    const m = window.location.pathname.match(/\/location\/([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  }

  // Only run on this one sub-account, even if this script ends up loaded
  // agency-wide (matches how the existing inject.js loader is scoped).
  if (getLocationIdFromUrl() !== TARGET_LOCATION_ID) {
    alert('This tool only works on the Horizon Windows sub-account.');
    return;
  }

  // Resolve the backend origin from the <script src> that loaded this file.
  // Falls back to the known Railway URL rather than window.location.origin,
  // since a same-origin fallback would point at app.gohighlevel.com itself
  // (document.currentScript can be null for some async-loaded scripts).
  const API_BASE = (() => {
    try {
      const src = document.currentScript && document.currentScript.src;
      if (src) return new URL(src).origin;
    } catch (e) {
      /* fall through to hardcoded default below */
    }
    return 'https://ghlduplicatehorizon-production.up.railway.app';
  })();

  function getContactIdFromDetailUrl() {
    const m = window.location.pathname.match(/\/contacts\/detail\/([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  }

  function isListView() {
    return /\/contacts\/(smart_list|list)/.test(window.location.pathname);
  }

  function getContactIdFromRow(row) {
    const link = row.querySelector('a[href*="/contacts/detail/"]');
    if (link) {
      const m = link.getAttribute('href').match(/\/contacts\/detail\/([a-zA-Z0-9]+)/);
      if (m) return m[1];
    }
    const idAttr = row.getAttribute('data-contact-id') || row.getAttribute('data-id');
    return idAttr || null;
  }

  function getSelectedContactIds() {
    const checked = document.querySelectorAll(
      'table input[type="checkbox"]:checked, [role="row"] input[type="checkbox"]:checked'
    );
    const ids = [];
    checked.forEach((cb) => {
      const row = cb.closest('tr') || cb.closest('[role="row"]');
      if (row) {
        const id = getContactIdFromRow(row);
        if (id) ids.push(id);
      }
    });
    return [...new Set(ids)];
  }

  // ---- UI ----

  let isDuplicating = false;
  let container;
  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.id = 'ghl-dup-contact-widget';
    container.style.setProperty('position', 'fixed', 'important');
    container.style.setProperty('bottom', '24px', 'important');
    container.style.setProperty('right', '24px', 'important');
    container.style.setProperty('z-index', '2147483647', 'important');
    container.style.setProperty('display', 'block', 'important');
    document.body.appendChild(container);
    return container;
  }

  function styleButton(btn) {
    Object.assign(btn.style, {
      background: '#1a73e8',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      padding: '12px 18px',
      fontSize: '14px',
      fontWeight: '600',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
      cursor: 'pointer',
    });
  }

  function showToast(message, isError) {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      right: '24px',
      background: isError ? '#c62828' : '#323232',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '6px',
      fontSize: '13px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
      zIndex: 999999,
      maxWidth: '320px',
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  async function duplicateOne(contactId) {
    try {
      const res = await fetch(`${API_BASE}/api/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      const data = await res.json();
      return { contactId, ...data };
    } catch (err) {
      return { contactId, success: false, error: err.message };
    }
  }

  async function callDuplicate(contactIds) {
    const results = [];
    for (const id of contactIds) {
      // sequential, so we don't hammer the GHL API if multiple are selected
      results.push(await duplicateOne(id));
    }
    return results;
  }

  function handleResults(results) {
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    if (successes.length) {
      showToast(`Duplicated ${successes.length} contact${successes.length > 1 ? 's' : ''}.`);
    }
    if (failures.length) {
      showToast(`${failures.length} failed to duplicate. Check console for details.`, true);
      console.error('Duplicate contact failures:', failures);
    }

    if (successes.length === 1) {
      const { newContactId, locationId } = successes[0];
      const url = `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${newContactId}`;
      window.open(url, '_blank');
    }
  }

  function renderDetailButton() {
    const el = ensureContainer();
    el.innerHTML = '';
    const btn = document.createElement('button');
    btn.textContent = 'Duplicate This Contact';
    styleButton(btn);
    btn.onclick = async () => {
      if (isDuplicating) return;
      const contactId = getContactIdFromDetailUrl();
      if (!contactId) return showToast('Could not read contact ID from URL.', true);
      isDuplicating = true;
      btn.disabled = true;
      btn.textContent = 'Duplicating…';
      const results = await callDuplicate([contactId]);
      isDuplicating = false;
      btn.disabled = false;
      btn.textContent = 'Duplicate This Contact';
      handleResults(results);
    };
    el.appendChild(btn);
  }

  function renderListButton() {
    if (isDuplicating) return; // don't reset the button mid-request
    const el = ensureContainer();
    const selected = getSelectedContactIds();
    el.innerHTML = '';
    if (selected.length === 0) return; // hide button until something's checked

    const btn = document.createElement('button');
    btn.textContent = `Duplicate Selected (${selected.length})`;
    styleButton(btn);
    btn.onclick = async () => {
      if (isDuplicating) return;
      isDuplicating = true;
      btn.disabled = true;
      btn.textContent = 'Duplicating…';
      const results = await callDuplicate(selected);
      isDuplicating = false;
      handleResults(results);
      renderListButton();
    };
    el.appendChild(btn);
  }

  function render() {
    if (isDuplicating) return;
    if (getContactIdFromDetailUrl()) {
      renderDetailButton();
    } else if (isListView()) {
      renderListButton();
    } else if (container) {
      container.innerHTML = '';
    }
  }

  function init() {
    // Debounced navigation watcher — GHL is a SPA, so a burst of DOM changes
    // (initial load, list virtualization) collapses into one check instead of
    // running on every individual mutation.
    let lastPath = window.location.pathname;
    let debounceTimer = null;
    function scheduleNavCheck() {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (window.location.pathname !== lastPath) {
          lastPath = window.location.pathname;
          render();
        }
      }, 250);
    }
    const observer = new MutationObserver(scheduleNavCheck);
    observer.observe(document.body, { childList: true, subtree: true });

    // Selection changes on the list view: a targeted listener instead of
    // rescanning the whole page on every DOM mutation.
    document.addEventListener(
      'change',
      (e) => {
        if (isListView() && e.target && e.target.matches('input[type="checkbox"]')) {
          renderListButton();
        }
      },
      true
    );

    render();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
