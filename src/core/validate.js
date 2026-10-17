// Validation before saving. errors block saving; warnings ask for confirmation.
import { TX, TX_TYPES, CATEGORY_TYPES } from './model.js';
import { isIsoDate } from './dates.js';
import { isValidAmount, LARGE_AMOUNT_CONFIRM, formatRp } from './money.js';
import { balances } from './ledger.js';

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

/**
 * @param tx the transaction to save (new or edited; an edit keeps the same id)
 * @param data current data snapshot
 * @param opts { today: 'YYYY-MM-DD', now: Date }
 */
export function validateTransaction(tx, data, { today, now = new Date() }) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });
  const warn = (code, message) => warnings.push({ code, message });

  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const holdings = new Map(data.holdings.map((h) => [h.id, h]));

  if (!TX_TYPES.includes(tx.type)) err('type', 'Unknown transaction type.');
  if (!isIsoDate(tx.date)) err('date', 'Enter a valid date.');
  if (!isValidAmount(tx.amount)) err('amount', 'Amount must be a whole number above Rp0.');
  if (tx.type === TX.ADJUSTMENT && tx.sign !== 1 && tx.sign !== -1) err('amount', 'Invalid adjustment direction.');
  if (tx.isRefund && tx.type !== TX.EXPENSE) err('isRefund', 'Refunds only apply to expenses.');

  const acc = accounts.get(tx.accountId);
  if (!tx.accountId || !acc) err('accountId', tx.type === TX.TRANSFER ? 'Choose the source account.' : 'Choose an account.');
  else {
    if (isIsoDate(tx.date) && acc.openingDate && tx.date < acc.openingDate) {
      err('date', `Date is before the opening balance of ${acc.name} (${acc.openingDate}).`);
    }
    if (acc.archived) warn('archived', `${acc.name} is archived.`);
  }

  if (tx.type === TX.TRANSFER) {
    const to = accounts.get(tx.toAccountId);
    if (!tx.toAccountId || !to) err('toAccountId', 'Choose the destination account.');
    else if (tx.toAccountId === tx.accountId) err('toAccountId', 'Source and destination must be different accounts.');
    else if (isIsoDate(tx.date) && to.openingDate && tx.date < to.openingDate) {
      err('date', `Date is before the opening balance of ${to.name} (${to.openingDate}).`);
    }
  }

  if (CATEGORY_TYPES.includes(tx.type)) {
    const cat = categories.get(tx.categoryId);
    if (!tx.categoryId || !cat) err('categoryId', 'Choose a category.');
    else if (cat.type !== tx.type || cat.parentId) err('categoryId', 'Category does not match the transaction type.');
    if (tx.subcategoryId) {
      const sub = categories.get(tx.subcategoryId);
      if (!sub || sub.parentId !== tx.categoryId) err('subcategoryId', 'Subcategory does not belong to this category.');
    }
  }

  if (tx.type === TX.INVEST_BUY || tx.type === TX.INVEST_SELL) {
    if (!tx.holdingId || !holdings.has(tx.holdingId)) err('holdingId', 'Choose an investment holding.');
    for (const f of ['units', 'unitPrice', 'fee']) {
      if (tx[f] !== undefined && tx[f] !== null && !(Number.isFinite(tx[f]) && tx[f] >= 0)) err(f, 'Enter 0 or more.');
    }
  }

  if (isIsoDate(tx.date) && tx.date > today) warn('future', 'The date is in the future.');
  if (isValidAmount(tx.amount) && tx.amount > LARGE_AMOUNT_CONFIRM) {
    warn('large', `${formatRp(tx.amount)} is above Rp100 million. Check that no extra zeros were typed.`);
  }

  if (errors.length === 0) {
    // Negative-balance warning for cash and e-wallets, computed as if this transaction were saved.
    const others = data.transactions.filter((t) => t.id !== tx.id);
    const after = balances({ ...data, transactions: [...others, tx] }, null);
    for (const id of [tx.accountId, tx.toAccountId].filter(Boolean)) {
      const a = accounts.get(id);
      if (a && (a.kind === 'tunai' || a.kind === 'ewallet') && after.get(id) < 0) {
        warn('negative', `${a.name} balance would become ${formatRp(after.get(id))}.`);
      }
    }
    // Possible duplicate: a similar transaction saved within the last 2 minutes.
    const dup = data.transactions.find((t) =>
      !t.deletedAt && t.id !== tx.id && t.type === tx.type && t.amount === tx.amount &&
      t.date === tx.date && t.accountId === tx.accountId &&
      (t.categoryId ?? null) === (tx.categoryId ?? null) &&
      (t.holdingId ?? null) === (tx.holdingId ?? null) &&
      (t.toAccountId ?? null) === (tx.toAccountId ?? null) &&
      t.createdAt && now.getTime() - Date.parse(t.createdAt) <= DUPLICATE_WINDOW_MS);
    if (dup) warn('duplicate', 'The same transaction was just saved. Save it again?');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Name is required and unique (case-insensitive) among active siblings. */
export function validateName(name, siblings, selfId = null) {
  const n = String(name ?? '').trim();
  if (!n) return 'Name is required.';
  if (n.length > 60) return 'Name can be at most 60 characters.';
  const clash = siblings.find((s) => s.id !== selfId && s.active !== false && s.name.trim().toLowerCase() === n.toLowerCase());
  return clash ? 'This name is already used.' : null;
}

export function validateAccount(acc, data) {
  const errors = [];
  const nameErr = validateName(acc.name, data.accounts.filter((a) => !a.archived), acc.id);
  if (nameErr) errors.push({ field: 'name', message: nameErr });
  if (!Number.isSafeInteger(acc.openingBalance)) errors.push({ field: 'openingBalance', message: 'Opening balance must be a whole number (0 is fine).' });
  if (!isIsoDate(acc.openingDate)) errors.push({ field: 'openingDate', message: 'Opening balance date is required.' });
  else {
    const earliest = data.transactions
      .filter((t) => !t.deletedAt && (t.accountId === acc.id || t.toAccountId === acc.id))
      .map((t) => t.date).sort()[0];
    if (earliest && earliest < acc.openingDate) {
      errors.push({ field: 'openingDate', message: `There is already a transaction on ${earliest}; the opening date must be on or before it.` });
    }
  }
  return { ok: errors.length === 0, errors };
}
