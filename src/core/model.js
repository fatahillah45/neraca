// Data model constants. Transaction types define the accounting rules and stay fixed in code;
// their labels, order, and visibility are data (see settings.typeGroups).

export const TX = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
  GIVING: 'giving',
  INVEST_BUY: 'invest_buy',
  INVEST_SELL: 'invest_sell',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
});

export const TX_TYPES = Object.values(TX);

// Groups shown to the user as "Type".
export const GROUP = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
  GIVING: 'giving',
  INVEST: 'invest',
  TRANSFER: 'transfer',
  ADJUSTMENT: 'adjustment',
});

export const DEFAULT_TYPE_GROUPS = [
  { key: GROUP.EXPENSE, label: 'Expense', hint: 'Spending (Pengeluaran)', hidden: false },
  { key: GROUP.INCOME, label: 'Income', hint: 'Earnings (Pendapatan)', hidden: false },
  { key: GROUP.GIVING, label: 'Human being', hint: 'Giving to others (Sedekah)', hidden: false },
  { key: GROUP.INVEST, label: 'Invested', hint: 'Buying or cashing out investments (Investasi)', hidden: false },
  { key: GROUP.TRANSFER, label: 'Transfer', hint: 'Between your own accounts', hidden: false },
  { key: GROUP.ADJUSTMENT, label: 'Adjustment', hint: 'Match the balance to the bank', hidden: false },
];

export function groupOfType(type) {
  if (type === TX.INVEST_BUY || type === TX.INVEST_SELL) return GROUP.INVEST;
  return type;
}

/** Types that use categories from the categories table. */
export const CATEGORY_TYPES = [TX.INCOME, TX.EXPENSE, TX.GIVING];

// Keys are stored data and must not change; only labels are translated.
export const ACCOUNT_KINDS = [
  { key: 'tunai', label: 'Cash' },
  { key: 'rekening', label: 'Bank account' },
  { key: 'ewallet', label: 'E-wallet' },
  { key: 'lainnya', label: 'Other' },
];

// Liquidity classes for the risk dashboard (keys are stored data).
export const LIQUIDITY = Object.freeze({
  FAST: 'cepat', // can be cashed out within 2 business days
  MONTH: 'bulan', // within 1 month
  LONG: 'panjang', // more than 1 month / waits for maturity
});

export const LIQUIDITY_LABELS = {
  [LIQUIDITY.FAST]: '≤ 2 business days',
  [LIQUIDITY.MONTH]: '≤ 1 month',
  [LIQUIDITY.LONG]: '> 1 month',
};

export const SCHEMA_VERSION = 1;

export function newId() {
  return globalThis.crypto.randomUUID();
}
