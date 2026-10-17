// Initial categories, subcategories, and instruments. All of them can be renamed, reordered, and deactivated in the app.
import { TX, LIQUIDITY, DEFAULT_TYPE_GROUPS, newId } from './model.js';

export const CATEGORY_TREE = {
  [TX.EXPENSE]: [
    ['Food & Beverages', '🍽️', ['Dining out', 'Groceries', 'Coffee & snacks']],
    ['Transportation', '🚗', ['Fuel', 'Ride-hailing', 'Parking & tolls', 'Public transport']],
    ['Housing & Bills', '🏠', ['Electricity', 'Water', 'Internet', 'Mobile credit & data', 'Rent']],
    ['Shopping', '🛍️', ['Clothing', 'Household', 'Electronics']],
    ['Health & Wellness', '🩺', ['Medicine', 'Doctor & clinic', 'Sports & fitness']],
    ['Personal Care & Grooming', '💈', []],
    ['Entertainment & Leisure', '🎬', []],
    ['Subscriptions & Services', '🔁', []],
    ['Education & Self-development', '📚', ['Books', 'Courses']],
    ['Gifts & Presents', '🎁', []],
    ['Bank Fees', '🏦', []],
    ['Other', '•', []],
  ],
  [TX.INCOME]: [
    ['Salary', '💼', []],
    ['Bonus & Allowances', '⭐', []],
    ['Investment Income', '📈', ['Interest', 'Dividends', 'Bond coupons']],
    ['Sales of Goods', '🏷️', []],
    ['Gifts Received', '🎁', []],
    ['Other', '•', []],
  ],
  [TX.GIVING]: [
    ['Worship & Religious', '🙏', []],
    ['Social Donations', '🤝', []],
    ['Family Support', '👪', []],
    ['Other', '•', []],
  ],
};

// Score 1 (low) to 5 (high). Initial assumptions for discussion, not an official measure.
export const INSTRUMENTS = [
  ['Gold', 3, LIQUIDITY.FAST, 'Moderate price swings; buy-sell spread; risk depends on where it is stored.'],
  ['Time Deposit (Deposito)', 1, LIQUIDITY.LONG, 'Fixed value; LPS-insured up to Rp2 billion per bank if the rate is within the LPS guarantee rate; penalty for early withdrawal.'],
  ['Government Bonds (SBN)', 2, LIQUIDITY.LONG, 'Issued by the Government of Indonesia; some series cannot be sold before maturity.'],
  ['Money Market Fund', 2, LIQUIDITY.FAST, 'Low price swings; redemption takes a few business days.'],
  ['Fixed Income Fund', 3, LIQUIDITY.FAST, 'Moderate swings following bond prices.'],
  ['Equity Fund', 5, LIQUIDITY.FAST, 'High swings following the stock market.'],
  ['Stocks', 5, LIQUIDITY.FAST, 'High swings; risk depends on the issuer; T+2 settlement.'],
  ['Other', 3, LIQUIDITY.MONTH, 'Set its risk profile yourself.'],
];

export function buildSeed() {
  const categories = [];
  for (const [type, list] of Object.entries(CATEGORY_TREE)) {
    list.forEach(([name, icon, subs], i) => {
      const id = newId();
      categories.push({ id, type, parentId: null, name, icon, order: i, active: true });
      subs.forEach((sub, j) => {
        categories.push({ id: newId(), type, parentId: id, name: sub, icon: '', order: j, active: true });
      });
    });
  }
  const instruments = INSTRUMENTS.map(([name, riskScore, liquidity, note], i) => ({
    id: newId(), name, riskScore, liquidity, note, order: i, active: true,
  }));
  return {
    categories,
    instruments,
    settings: [
      { key: 'typeGroups', value: DEFAULT_TYPE_GROUPS.map((g) => ({ ...g })) },
      { key: 'labelsLang', value: 'en' },
    ],
  };
}
