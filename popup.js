let activeTab = null;
let siteKey = null;

const siteNameEl = document.getElementById('site-name');
const deletionCountEl = document.getElementById('deletion-count');
const btnUndo = document.getElementById('btn-undo');
const btnReset = document.getElementById('btn-reset');
const toggleDeleteEnabled = document.getElementById('toggle-enabled');
const toggleEnabledBar = document.getElementById('toggle-enabled-bar');
const toggleShowHidden = document.getElementById('toggle-purge-disabled');
const confirmZone = document.getElementById('confirm-zone');
const btnConfirmReset = document.getElementById('btn-confirm-reset');
const btnCancelReset = document.getElementById('btn-cancel-reset');

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
      toggleDeleteEnabled.checked = response.deleteEnabled;
      toggleShowHidden.checked = response.showHidden;
      toggleDeleteEnabled.disabled = response.showHidden;
      toggleEnabledBar.classList.toggle('locked', response.showHidden);
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
      const state = await browser.tabs.sendMessage(activeTab.id, { action: 'GET_STATE' });
      if (state && state.success) {
        updateUI(state.deletionCount, state.undoStackSize);
      }
    }
  } catch (e) {
    console.error('[DOM Remover Popup] Undo failed:', e);
  }
});

btnReset.addEventListener('click', () => {
  confirmZone.classList.add('visible');
  btnReset.disabled = true;
  btnUndo.disabled = true;
});

btnCancelReset.addEventListener('click', () => {
  confirmZone.classList.remove('visible');
  const deletionCount = parseInt(deletionCountEl.textContent, 10) || 0;
  btnReset.disabled = deletionCount === 0;
  btnUndo.disabled = deletionCount === 0;
});

btnConfirmReset.addEventListener('click', async () => {
  btnConfirmReset.disabled = true;
  btnCancelReset.disabled = true;
  try {
    await browser.tabs.sendMessage(activeTab.id, { action: 'RESET' });
  } catch {
    // Page reloads, connection drops — expected
  }
  window.close();
});

toggleDeleteEnabled.addEventListener('change', async () => {
  try {
    await browser.tabs.sendMessage(activeTab.id, { action: 'SET_DELETE_ENABLED', value: toggleDeleteEnabled.checked });
  } catch (e) {
    console.error('[DOM Remover Popup] Toggle failed:', e);
  }
});

toggleShowHidden.addEventListener('change', async () => {
  const isShowingHidden = toggleShowHidden.checked;
  toggleDeleteEnabled.disabled = isShowingHidden;
  toggleEnabledBar.classList.toggle('locked', isShowingHidden);
  if (isShowingHidden) {
    toggleDeleteEnabled.checked = false;
    await browser.tabs.sendMessage(activeTab.id, { action: 'SET_DELETE_ENABLED', value: false }).catch(() => {});
  } else {
    await browser.tabs.sendMessage(activeTab.id, { action: 'SET_DELETE_ENABLED', value: true }).catch(() => {});
  }
  try {
    await browser.tabs.sendMessage(activeTab.id, { action: 'SET_SHOW_HIDDEN', value: isShowingHidden });
  } catch (e) {
    console.error('[DOM Remover Popup] Show hidden toggle failed:', e);
  }
});

init();
