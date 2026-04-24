async function getSelectorsForSite(siteKey) {
  const result = await browser.storage.local.get(siteKey);
  return result[siteKey] || [];
}

async function addSelectorForSite(siteKey, selectorRecord) {
  const records = await getSelectorsForSite(siteKey);
  records.push(selectorRecord);
  await browser.storage.local.set({ [siteKey]: records });
}

async function removeLastSelectorForSite(siteKey) {
  const records = await getSelectorsForSite(siteKey);
  if (records.length === 0) return;
  records.pop();
  await browser.storage.local.set({ [siteKey]: records });
}

async function clearSelectorsForSite(siteKey) {
  await browser.storage.local.remove(siteKey);
}

async function getDeleteEnabled() {
  const result = await browser.storage.local.get('__delete_enabled__');
  return result['__delete_enabled__'] !== false;
}

async function setDeleteEnabled(value) {
  await browser.storage.local.set({ '__delete_enabled__': value });
}

async function getShowHidden() {
  const result = await browser.storage.local.get('__show_hidden__');
  return result['__show_hidden__'] === true;
}

async function setShowHidden(value) {
  await browser.storage.local.set({ '__show_hidden__': value });
}
