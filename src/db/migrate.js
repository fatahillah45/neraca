// Applies one-time data migrations when the app starts.
import { loadSnapshot } from './db.js';
import { englishLabelUpdates } from '../core/translate.js';

export async function migrate(db) {
  const snap = await loadSnapshot(db);
  if (snap.settingsMap.labelsLang === 'en') return false;
  const u = englishLabelUpdates(snap);
  await db.transaction('rw', db.categories, db.instruments, db.settings, db.accounts, db.holdings, async () => {
    for (const c of u.categories) await db.categories.update(c.id, { name: c.name });
    for (const i of u.instruments) await db.instruments.update(i.id, { name: i.name, note: i.note });
    for (const a of u.accounts) await db.accounts.update(a.id, { name: a.name });
    for (const h of u.holdings) await db.holdings.update(h.id, { name: h.name });
    if (u.typeGroups) await db.settings.put({ key: 'typeGroups', value: u.typeGroups });
    await db.settings.put({ key: 'labelsLang', value: 'en' });
  });
  return true;
}
