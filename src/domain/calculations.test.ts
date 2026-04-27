import { describe, expect, it } from 'vitest';
import { getAccountBalances, getMonthlySummary, getTransactionsForMonth } from './calculations';
import { createSeedData } from '../data/seedData';

describe('finance calculations', () => {
  it('filters transactions by month', () => {
    const data = createSeedData();
    const month = data.budgets[0].month;

    expect(getTransactionsForMonth(data.transactions, month)).toHaveLength(data.transactions.length);
    expect(getTransactionsForMonth(data.transactions, '1999-01')).toHaveLength(0);
  });

  it('calculates budget and cash-flow totals', () => {
    const data = createSeedData();
    const month = data.budgets[0].month;
    const summary = getMonthlySummary(data, month);

    expect(summary.income).toBe(120000);
    expect(summary.expenses).toBe(40100);
    expect(summary.budgetLimit).toBe(78000);
    expect(summary.budgetRemaining).toBe(37900);
    expect(summary.expectedIncome).toBe(120000);
    expect(summary.expectedBills).toBe(36200);
    expect(summary.projectedLeftover).toBe(5800);
  });

  it('calculates account balances from opening balances and transactions', () => {
    const data = createSeedData();
    const balances = getAccountBalances(data);
    const bank = balances.find((item) => item.account.id === 'acct_bank_primary');
    const cash = balances.find((item) => item.account.id === 'acct_cash_wallet');
    const card = balances.find((item) => item.account.id === 'acct_credit_card');

    expect(bank?.balance).toBe(170000);
    expect(cash?.balance).toBe(2600);
    expect(card?.balance).toBe(-4200);
  });
});
