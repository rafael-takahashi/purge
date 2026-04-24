const siteKey = window.location.hostname;
const undoStack = [];
let deleteEnabled = true;
let showHidden = false;
let hiddenElements = [];
let shiftHeld = false;
let currentHovered = null;

function injectHighlightStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .dom-remover-highlight {
      outline: 2px solid #e53e3e !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
    }
  `;
  document.head.appendChild(style);
}

function generateSelector(el) {
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  if (el.classList.length > 0) {
    const classSelector =
      el.tagName.toLowerCase() +
      Array.from(el.classList)
        .map(c => `.${CSS.escape(c)}`)
        .join('');
    if (document.querySelectorAll(classSelector).length === 1) {
      return classSelector;
    }
  }

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

async function applyStoredDeletions() {
  hiddenElements = [];
  const records = await getSelectorsForSite(siteKey);
  for (const record of records) {
    try {
      const elements = document.querySelectorAll(record.selector);
      if (elements.length === 0) {
        console.warn(`[DOM Remover] Selector not found: ${record.selector}`);
        continue;
      }
      elements.forEach(el => {
        hiddenElements.push({ element: el, parent: el.parentNode, nextSibling: el.nextSibling });
        el.remove();
      });
    } catch (e) {
      console.warn(`[DOM Remover] Invalid selector: ${record.selector}`, e);
    }
  }
}

function restoreHiddenElements() {
  for (const { element, parent, nextSibling } of hiddenElements) {
    if (nextSibling) {
      parent.insertBefore(element, nextSibling);
    } else {
      parent.appendChild(element);
    }
  }
  hiddenElements = [];
}

async function handleUndo() {
  if (undoStack.length === 0) return (await getSelectorsForSite(siteKey)).length;
  const entry = undoStack.pop();
  const { element, parent, nextSibling } = entry;
  if (nextSibling) {
    parent.insertBefore(element, nextSibling);
  } else {
    parent.appendChild(element);
  }
  const idx = hiddenElements.indexOf(entry);
  if (idx !== -1) hiddenElements.splice(idx, 1);
  await removeLastSelectorForSite(siteKey);
  return (await getSelectorsForSite(siteKey)).length;
}

async function handleReset() {
  await clearSelectorsForSite(siteKey);
  window.location.reload();
}

function onMouseOver(event) {
  if (!deleteEnabled || showHidden) return;
  const el = event.target;
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return;
  currentHovered = el;
  if (shiftHeld) el.classList.add('dom-remover-highlight');
}

function onMouseOut(event) {
  event.target.classList.remove('dom-remover-highlight');
  currentHovered = null;
}

function onKeyDown(event) {
  if (event.key !== 'Shift' || shiftHeld) return;
  shiftHeld = true;
  if (deleteEnabled && !showHidden && currentHovered) currentHovered.classList.add('dom-remover-highlight');
}

function onKeyUp(event) {
  if (event.key !== 'Shift') return;
  shiftHeld = false;
  document.querySelectorAll('.dom-remover-highlight').forEach(el =>
    el.classList.remove('dom-remover-highlight')
  );
}

function onClick(event) {
  if (!deleteEnabled || showHidden) return;
  if (!event.shiftKey) return;
  const el = event.target;
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return;
  event.preventDefault();
  event.stopPropagation();
  el.classList.remove('dom-remover-highlight');
  const selector = generateSelector(el);
  const parent = el.parentNode;
  const nextSibling = el.nextSibling;
  const entry = { element: el, selector, parent, nextSibling };
  undoStack.push(entry);
  hiddenElements.push(entry);
  el.remove();
  addSelectorForSite(siteKey, { selector });
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'UNDO') {
    handleUndo().then(count => sendResponse({ success: true, deletionCount: count }));
    return true;
  }
  if (message.action === 'RESET') {
    handleReset().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.action === 'GET_STATE') {
    getSelectorsForSite(siteKey).then(records =>
      sendResponse({ success: true, deletionCount: records.length, undoStackSize: undoStack.length, deleteEnabled, showHidden })
    );
    return true;
  }
  if (message.action === 'SET_SHOW_HIDDEN') {
    showHidden = message.value;
    if (showHidden) {
      restoreHiddenElements();
    } else {
      applyStoredDeletions();
    }
    setShowHidden(showHidden).then(() => sendResponse({ success: true, showHidden }));
    return true;
  }
  if (message.action === 'SET_DELETE_ENABLED') {
    deleteEnabled = message.value;
    if (!deleteEnabled) {
      document.querySelectorAll('.dom-remover-highlight').forEach(el =>
        el.classList.remove('dom-remover-highlight')
      );
    }
    setDeleteEnabled(deleteEnabled).then(() => sendResponse({ success: true, deleteEnabled }));
    return true;
  }
});

(async function init() {
  injectHighlightStyle();
  showHidden = await getShowHidden();
  deleteEnabled = await getDeleteEnabled();
  if (!showHidden) await applyStoredDeletions();
  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('click', onClick, true);
})();
