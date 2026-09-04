(() => {
  const TARGET_LOCATION_ID = 'NOzIY7QjqCaxRk3Scl3A';

  function getLocationIdFromUrl() {
    const m = window.location.pathname.match(/\/location\/([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  }

  // Only run on this one sub-account.
  if (getLocationIdFromUrl() !== TARGET_LOCATION_ID) return;

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
    document.body.appendChild(container);
    return container;
  }

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'ghl-dup-toast' + (isError ? ' ghl-dup-toast-error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function callDuplicate(contactIds, onDone) {
    chrome.runtime.sendMessage({ type: 'DUPLICATE_CONTACTS', contactIds }, (response) => {
      onDone(response?.results || []);
    });
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

    // If exactly one new contact was created, open it in a new tab.
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
    btn.className = 'ghl-dup-btn';
    btn.textContent = 'Duplicate This Contact';
    btn.onclick = () => {
      if (isDuplicating) return;
      const contactId = getContactIdFromDetailUrl();
      if (!contactId) return showToast('Could not read contact ID from URL.', true);
      isDuplicating = true;
      btn.disabled = true;
      btn.textContent = 'Duplicating…';
      callDuplicate([contactId], (results) => {
        isDuplicating = false;
        btn.disabled = false;
        btn.textContent = 'Duplicate This Contact';
        handleResults(results);
      });
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
    btn.className = 'ghl-dup-btn';
    btn.textContent = `Duplicate Selected (${selected.length})`;
    btn.onclick = () => {
      if (isDuplicating) return;
      isDuplicating = true;
      btn.disabled = true;
      btn.textContent = 'Duplicating…';
      callDuplicate(selected, (results) => {
        isDuplicating = false;
        handleResults(results);
        renderListButton(); // refresh count/visibility
      });
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

  // Re-render on navigation (GHL is a SPA) — debounced so a burst of DOM changes
  // (e.g. the initial page load, or list virtualization while scrolling) collapses
  // into a single check instead of running on every individual mutation.
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

  // Selection changes on the list view are handled separately via a lightweight,
  // targeted listener instead of rescanning the whole page on every DOM mutation.
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
})();
