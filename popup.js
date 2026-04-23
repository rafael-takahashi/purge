let activeTab = null;
let siteKey = null;

const siteNameEl = document.getElementById('site-name');
const deletionCountEl = document.getElementById('deletion-count');
const btnUndo = document.getElementById('btn-undo');
const btnReset = document.getElementById('btn-reset');
const toggleEnabled = document.getElementById('toggle-enabled');

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function updateUI(deletionCount, undoStackSize) {
  deletionCountEl.textContent = deletionCount;
  btnReset.disabled = deletionCount === 0;
  btnUndo.disabled = deletionCount === 0 || undoStackSize === 0;
}

async function init() {
  activeTab = await getActiveTab();
  if (!activeTab || !activeTab.url) return;

  try {
    const url = new URL(activeTab.url);
    siteKey = url.hostname;
  } catch {
    return;
  }

  siteNameEl.textContent = siteKey || '—';

  try {
    const response = await browser.tabs.sendMessage(activeTab.id, { action: 'GET_STATE' });
    if (response && response.success) {
      updateUI(response.deletionCount, response.undoStackSize);
      toggleEnabled.checked = response.enabled;
    }
  } catch {
    deletionCountEl.textContent = '—';
  }
}

btnUndo.addEventListener('click', async () => {
  btnUndo.disabled = true;
  try {
    const response = await browser.tabs.sendMessage(activeTab.id, { action: 'UNDO' });
    if (response && response.success) {
      updateUI(response.deletionCount, response.deletionCount > 0 ? 1 : 0);
      // Re-fetch accurate undo stack size
      const state = await browser.tabs.sendMessage(activeTab.id, { action: 'GET_STATE' });
      if (state && state.success) {
        updateUI(state.deletionCount, state.undoStackSize);
      }
    }
  } catch (e) {
    console.error('[DOM Remover Popup] Undo failed:', e);
  }
});

btnReset.addEventListener('click', async () => {
  const confirmed = window.confirm(
    `This will remove all deletion rules for ${siteKey} and reload the page. Continue?`
  );
  if (!confirmed) return;

  btnReset.disabled = true;
  try {
    await browser.tabs.sendMessage(activeTab.id, { action: 'RESET' });
  } catch {
    // Page reloads, connection drops — expected
  }
  window.close();
});

toggleEnabled.addEventListener('change', async () => {
  try {
    await browser.tabs.sendMessage(activeTab.id, { action: 'SET_ENABLED', value: toggleEnabled.checked });
  } catch (e) {
    console.error('[DOM Remover Popup] Toggle failed:', e);
  }
});

init();
