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

async function getEnabled() {
  const result = await browser.storage.local.get('__enabled__');
  return result['__enabled__'] !== false;
}

async function setEnabled(value) {
  await browser.storage.local.set({ '__enabled__': value });
}
