# Product Requirements Document: Purge Browser Extension

## Overview

A browser extension that allows users to permanently remove DOM elements from webpages via direct interaction. Removals persist across page reloads and are scoped per website. The extension provides undo and reset functionality.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Permissions](#permissions)
3. [Storage](#storage)
4. [Content Script](#content-script)
5. [Popup UI](#popup-ui)
6. [Messaging Protocol](#messaging-protocol)
7. [Selector Strategy](#selector-strategy)
8. [Undo System](#undo-system)
9. [Reset Behavior](#reset-behavior)
10. [Edge Cases](#edge-cases)
11. [Testing Requirements](#testing-requirements)

---

## Architecture

The extension is composed of three distinct layers that communicate via the browser messaging API.

### Components

**Content Script (`content.js`)**
- Injected into every page on document load
- Responsible for: hover highlighting, Shift+Click deletion, applying stored deletions on load, in-memory undo stack management
- Does not directly render UI; communicates state to the popup on request

**Popup (`popup.html` + `popup.js`)**
- Rendered when the user clicks the extension icon in the browser toolbar
- Displays current site deletion count
- Provides Undo Last and Reset Site buttons
- Sends action messages to the content script of the active tab

**Storage Layer (`storage.js` — shared utility module)**
- Wrapper around `browser.storage.local`
- All reads and writes go through this module
- Enforces the schema and scopes all operations by site key

### Component Interaction Diagram

```
[User Interaction on Page]
        |
        v
[Content Script]  <---messages--->  [Popup UI]
        |
        v
[storage.js utility]
        |
        v
[browser.storage.local]
```

---

## Permissions

Declare the following in `manifest.json`:

```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```

---

## Storage

### Schema

All data is stored under a single key namespace in `browser.storage.local`. The top-level object maps a site identifier (hostname) to an array of selector records.

```json
{
  "example.com": [
    { "selector": "#cookie-banner" },
    { "selector": "div.ad-slot" }
  ],
  "another-site.com": [
    { "selector": ".modal-overlay" }
  ]
}
```

### Site Identifier

The site identifier is derived from `window.location.hostname`. This normalizes `www.example.com` and `example.com` as distinct keys. If stricter origin-level scoping is needed (e.g., to separate `http` from `https`), use `window.location.origin` instead. The default implementation uses `hostname`.

```js
function getSiteKey() {
  return window.location.hostname;
}
```

### Storage Module API (`storage.js`)

```js
// Returns array of selector records for the current site, or []
async function getSelectorsForSite(siteKey) {}

// Appends a new selector record to the site's array
async function addSelectorForSite(siteKey, selectorRecord) {}

// Removes the most recently added selector for the site
async function removeLastSelectorForSite(siteKey) {}

// Deletes all selector records for the site
async function clearSelectorsForSite(siteKey) {}

// Returns the global enabled state (defaults to true if unset)
async function getEnabled() {}

// Persists the global enabled state
async function setEnabled(value) {}
```

### Read / Write Logic

**On page load** — content script calls `getSelectorsForSite(siteKey)` and applies each stored selector by hiding or removing matching elements.

**On deletion** — content script calls `addSelectorForSite(siteKey, { selector })` after removing the element from the DOM.

**On undo** — content script pops from the in-memory undo stack, restores the element to the DOM, then calls `removeLastSelectorForSite(siteKey)` to keep storage in sync.

**On reset** — popup sends a `RESET_SITE` message; content script calls `clearSelectorsForSite(siteKey)` and reloads the page.

---

## Content Script

### Initialization Sequence

On `document_idle`:

1. Derive `siteKey` from `window.location.hostname`
2. Call `getSelectorsForSite(siteKey)`
3. For each stored selector, query the DOM and remove matching elements
4. Attach `mouseover` and `mouseout` event listeners for hover highlighting
5. Attach a `click` event listener gated on `event.shiftKey`
6. Initialize an empty in-memory undo stack: `const undoStack = []`

### Hover Highlighting

- On `mouseover`: add a CSS outline to the hovered element (e.g., `2px solid red`)
- On `mouseout`: remove the outline
- Do not highlight `html` or `body` elements
- Apply highlight via a dedicated CSS class injected into the page head to avoid inline style conflicts

```css
.dom-remover-highlight {
  outline: 2px solid #e53e3e !important;
  outline-offset: 2px !important;
  cursor: crosshair !important;
}
```

### Shift+Click Deletion

```
on click event:
  if event.shiftKey is false → return (ignore click)
  if target is html or body → return (blocked)
  event.preventDefault()
  event.stopPropagation()
  generate selector for target element
  push { element, selector, parent, nextSibling } onto undoStack
  remove element from DOM
  call addSelectorForSite(siteKey, { selector })
```

The undo stack entry must capture enough information to restore the element:

```js
{
  element: HTMLElement,   // reference to the removed node
  selector: string,       // generated selector string
  parent: HTMLElement,    // parent node at time of removal
  nextSibling: Node|null  // next sibling for re-insertion order
}
```

### Applying Stored Deletions on Load

```js
for (const record of storedSelectors) {
  const elements = document.querySelectorAll(record.selector);
  elements.forEach(el => el.remove());
}
```

If `querySelectorAll` throws (invalid selector) or returns no results, log a warning and continue. Do not throw.

---

## Popup UI

### Layout

```
-------------------------------
| Enabled  [  ✓] |
-------------------------------
| Site: example.com           |
| Deletions: 4                |
-------------------------------
| [Undo Last]   [Reset Site]  |
-------------------------------
```

### Behavior

On open:
1. Query the active tab to get its hostname
2. Call `getSelectorsForSite(siteKey)` to get the deletion count
3. Send `GET_STATE` to the content script to read `enabled` flag
4. Render the site name, count, and toggle state

**Enabled toggle:**
- A checkbox toggle at the top of the popup
- Reflects the current `enabled` state from the content script
- On change: sends `{ action: "SET_ENABLED", value: boolean }` to the content script
- When disabled: hover highlight is removed from any currently highlighted element; Shift+Click does nothing
- When re-enabled: hover highlighting resumes immediately on next `mouseover`
- Does **not** affect stored deletions applied on page load — those always run regardless of toggle state
- State persists across page navigations via `browser.storage.local` under key `__enabled__`

**Undo Last button:**
- Sends `{ action: "UNDO" }` message to the content script of the active tab
- Refreshes the displayed deletion count on response

**Reset Site button:**
- Displays a confirmation prompt before proceeding: "This will remove all deletion rules for example.com and reload the page. Continue?"
- On confirm: sends `{ action: "RESET" }` message to the content script
- Content script handles storage clearing and page reload

### Disabled States

- "Undo Last" is disabled when deletion count is 0 or undo stack is empty
- "Reset Site" is disabled when deletion count is 0

---

## Messaging Protocol

All messages are sent using `browser.tabs.sendMessage` from the popup and received via `browser.runtime.onMessage` in the content script.

### Message Types

```js
// Popup → Content Script
{ action: "UNDO" }
{ action: "RESET" }
{ action: "GET_STATE" }
{ action: "SET_ENABLED", value: boolean }

// Content Script → Popup (responses)
{ success: true, deletionCount: number, undoStackSize: number, enabled: boolean }
{ success: true }  // RESET, SET_ENABLED
{ success: false, error: string }
```

### Handler in Content Script

```js
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "UNDO") {
    handleUndo().then(count => sendResponse({ success: true, deletionCount: count }));
    return true; // keep channel open for async
  }
  if (message.action === "RESET") {
    handleReset().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.action === "GET_STATE") {
    getSelectorsForSite(siteKey).then(records =>
      sendResponse({ success: true, deletionCount: records.length, undoStackSize: undoStack.length, enabled })
    );
    return true;
  }
  if (message.action === "SET_ENABLED") {
    enabled = message.value;
    if (!enabled) {
      document.querySelectorAll('.dom-remover-highlight').forEach(el =>
        el.classList.remove('dom-remover-highlight')
      );
    }
    setEnabled(enabled).then(() => sendResponse({ success: true, enabled }));
    return true;
  }
});
```

---

## Selector Strategy

Selector generation must produce stable, specific selectors that survive page reloads. Prefer the simplest selector that uniquely identifies the element.

### Priority Order

1. **ID attribute** — if the element has a non-empty `id`, use `#id`
2. **Tag + class combination** — if the element has classes, use `tag.class1.class2`; verify uniqueness
3. **nth-child path** — walk up the DOM tree generating an `:nth-child` chain until a unique selector is reached

### Implementation

```js
function generateSelector(el) {
  // Priority 1: ID
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  // Priority 2: tag + classes (if unique in document)
  if (el.classList.length > 0) {
    const classSelector = el.tagName.toLowerCase() +
      Array.from(el.classList).map(c => `.${CSS.escape(c)}`).join('');
    if (document.querySelectorAll(classSelector).length === 1) {
      return classSelector;
    }
  }

  // Priority 3: nth-child path
  return getNthChildPath(el);
}

function getNthChildPath(el) {
  const parts = [];
  let current = el;
  while (current && current !== document.body) {
    const parent = current.parentNode;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }
  return parts.join(' > ');
}
```

### Notes on Dynamic DOMs

For React, Vue, Angular, and other frameworks that re-render the DOM:

- Selectors based on `nth-child` paths may become invalid after re-renders
- The extension applies deletions on `document_idle`; elements that are injected after this point (e.g., via client-side routing) will not be re-removed in the same page session
- Future enhancement: use a `MutationObserver` to re-apply deletions when new nodes matching stored selectors are added to the DOM (out of scope for v1)

---

## Undo System

The undo system is in-memory only. It does not persist across page reloads. It operates on a per-session, per-site basis.

### Stack Operations

```js
const undoStack = []; // module-level array in content.js

// On deletion
undoStack.push({ element, selector, parent, nextSibling });

// On undo
async function handleUndo() {
  if (undoStack.length === 0) return;
  const { element, parent, nextSibling } = undoStack.pop();
  if (nextSibling) {
    parent.insertBefore(element, nextSibling);
  } else {
    parent.appendChild(element);
  }
  await removeLastSelectorForSite(siteKey);
  return (await getSelectorsForSite(siteKey)).length;
}
```

### Constraints

- Undo only affects deletions made in the current page session
- Undo does not restore elements that were deleted in previous sessions (those were removed on page load and no DOM reference is available)
- Undo operates on the storage array assuming append-only order; `removeLastSelectorForSite` removes the last entry

---

## Reset Behavior

Reset clears all stored deletion rules for the current site and reloads the page.

```js
async function handleReset() {
  await clearSelectorsForSite(siteKey);
  window.location.reload();
}
```

- Reset is scoped to the current site only; no other site's data is affected
- The undo stack is implicitly cleared on reload
- The popup must confirm with the user before triggering reset

---

## Edge Cases

### Prevent Deletion of `html` and `body`

In the Shift+Click handler, check before proceeding:

```js
const blocked = ['html', 'body'];
if (blocked.includes(event.target.tagName.toLowerCase())) return;
```

### Selector Invalidation

If a stored selector no longer matches any element on load:

- Log a warning to the console: `[DOM Remover] Selector not found: <selector>`
- Skip silently and continue applying remaining selectors
- Do not remove the invalid selector from storage automatically (the element may appear later via dynamic rendering)

### Dynamic DOM / Client-Side Routing

- v1 applies deletions once at `document_idle`
- SPAs that navigate without a full page reload will not re-trigger the content script
- Mitigation (v1): document this limitation; full SPA support via `MutationObserver` is a v2 concern

### Multiple Matching Elements

If a selector matches more than one element:

- Remove all matching elements
- Store the selector once
- On undo, only the single element captured at deletion time is restored (the others remain removed)

### Extension Disabled / Removed

- `browser.storage.local` data persists independently of the extension being enabled
- On reinstall, stored selectors are re-applied automatically

---

## Testing Requirements

### Per-Site Persistence

- Delete an element on `site-a.com`; verify it is absent on reload
- Visit `site-b.com`; verify no deletions are applied
- Verify `browser.storage.local` contains keys only for sites where deletions were made

### No Cross-Site Leakage

- Stored selectors for `site-a.com` must never be applied on `site-b.com`
- The storage key must be checked against the current `window.location.hostname` before applying any selector
- Test with two sites that share a common selector (e.g., both have `.header`); deleting on one must not affect the other

### Undo Behavior

- Delete element A, then element B; undo once → B is restored, A remains deleted
- Undo again → A is restored
- Verify `browser.storage.local` reflects correct count after each undo
- Reload page after one deletion; verify undo is not available (undo stack is empty after reload)

### Reset Behavior

- Delete two elements on `example.com`; open popup; click Reset
- Verify page reloads
- Verify no elements are removed after reload
- Verify `browser.storage.local` has no entry for `example.com`
- Verify another site's entries are unaffected

### Selector Generation

- Element with ID: verify selector is `#id`
- Element with unique class: verify selector is `tag.class`
- Element with no ID or unique class: verify nth-child path resolves correctly after reload
- Element inside a React-rendered tree: verify selector is applied on `document_idle`

### Blocked Elements

- Shift+Click on `<body>`: verify no deletion occurs and no error is thrown
- Shift+Click on `<html>`: same as above
