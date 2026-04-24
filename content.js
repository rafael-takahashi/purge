const siteKey = window.location.hostname;
const undoStack = [];
let enabled = true;
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
  const records = await getSelectorsForSite(siteKey);
  for (const record of records) {
    try {
      const elements = document.querySelectorAll(record.selector);
      if (elements.length === 0) {
        console.warn(`[DOM Remover] Selector not found: ${record.selector}`);
        continue;
      }
      elements.forEach(el => el.remove());
    } catch (e) {
      console.warn(`[DOM Remover] Invalid selector: ${record.selector}`, e);
    }
  }
}

async function handleUndo() {
  if (undoStack.length === 0) return (await getSelectorsForSite(siteKey)).length;
  const { element, parent, nextSibling } = undoStack.pop();
  if (nextSibling) {
    parent.insertBefore(element, nextSibling);
  } else {
    parent.appendChild(element);
  }
  await removeLastSelectorForSite(siteKey);
  return (await getSelectorsForSite(siteKey)).length;
}

async function handleReset() {
  await clearSelectorsForSite(siteKey);
  window.location.reload();
}

function onMouseOver(event) {
  if (!enabled) return;
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
  if (enabled && currentHovered) currentHovered.classList.add('dom-remover-highlight');
}

function onKeyUp(event) {
  if (event.key !== 'Shift') return;
  shiftHeld = false;
  document.querySelectorAll('.dom-remover-highlight').forEach(el =>
    el.classList.remove('dom-remover-highlight')
  );
}

function onClick(event) {
  if (!enabled) return;
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
  undoStack.push({ element: el, selector, parent, nextSibling });
  el.remove();
  addSelectorForSite(siteKey, { selector });
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      sendResponse({ success: true, deletionCount: records.length, undoStackSize: undoStack.length, enabled })
    );
    return true;
  }
  if (message.action === 'SET_ENABLED') {
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

(async function init() {
  injectHighlightStyle();
  await applyStoredDeletions();
  enabled = await getEnabled();
  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('click', onClick, true);
})();
