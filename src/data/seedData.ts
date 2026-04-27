import { getMonthKey, todayIsoDate } from '../domain/dates';
import type { Account, Category, FinanceData, MonthlyBudget, RecurringItem, Transaction } from '../domain/types';

const nowIso = () => new Date().toISOString();

export const makeId = (prefix: string) => {
  const uuid = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${uuid}`;
};

const stamp = () => {
  const now = nowIso();
  return { createdAt: now, updatedAt: now };
};

export const createSeedData = (): FinanceData => {
  const month = getMonthKey();
  const bank: Account = {
    id: 'acct_bank_primary',
    name: 'Primary Bank',
    type: 'bank',
    openingBalance: 85000,
    color: '#2563eb',
    ...stamp()
  };
  const cash: Account = {
    id: 'acct_cash_wallet',
    name: 'Cash Wallet',
    type: 'cash',
    openingBalance: 3500,
    color: '#059669',
    ...stamp()
  };
  const card: Account = {
    id: 'acct_credit_card',
    name: 'Credit Card',
    type: 'card',
    openingBalance: 0,
    color: '#be123c',
    ...stamp()
  };

  const salary: Category = {
    id: 'cat_salary',
    name: 'Salary',
    kind: 'income',
    color: '#0f766e',
    ...stamp()
  };
  const food: Category = {
    id: 'cat_food',
    name: 'Food',
    kind: 'expense',
    color: '#ea580c',
    ...stamp()
  };
  const rent: Category = {
    id: 'cat_rent',
    name: 'Rent',
    kind: 'expense',
    color: '#7c3aed',
    ...stamp()
  };
  const transport: Category = {
    id: 'cat_transport',
    name: 'Transport',
    kind: 'expense',
    color: '#0891b2',
    ...stamp()
  };
  const utilities: Category = {
    id: 'cat_utilities',
    name: 'Utilities',
    kind: 'expense',
    color: '#ca8a04',
    ...stamp()
  };
  const shopping: Category = {
    id: 'cat_shopping',
    name: 'Shopping',
    kind: 'expense',
    color: '#db2777',
    ...stamp()
  };

  const transactions: Transaction[] = [
    {
      id: 'txn_salary_current',
      date: `${month}-01`,
      type: 'income',
      amount: 120000,
      categoryId: salary.id,
      accountId: bank.id,
      notes: 'Monthly salary',
      ...stamp()
    },
    {
      id: 'txn_rent_current',
      date: `${month}-03`,
      type: 'expense',
      amount: 35000,
      categoryId: rent.id,
      accountId: bank.id,
      notes: 'Apartment rent',
      ...stamp()
    },
    {
      id: 'txn_groceries_current',
      date: todayIsoDate(),
      type: 'expense',
      amount: 4200,
      categoryId: food.id,
      accountId: card.id,
      notes: 'Groceries',
      ...stamp()
    },
    {
      id: 'txn_commute_current',
      date: todayIsoDate(),
      type: 'expense',
      amount: 900,
      categoryId: transport.id,
      accountId: cash.id,
      notes: 'Commute',
      ...stamp()
    }
  ];

  const budgets: MonthlyBudget[] = [
    { id: 'budget_food', month, categoryId: food.id, limit: 18000, ...stamp() },
    { id: 'budget_rent', month, categoryId: rent.id, limit: 35000, ...stamp() },
    { id: 'budget_transport', month, categoryId: transport.id, limit: 7000, ...stamp() },
    { id: 'budget_utilities', month, categoryId: utilities.id, limit: 6000, ...stamp() },
    { id: 'budget_shopping', month, categoryId: shopping.id, limit: 12000, ...stamp() }
  ];

  const recurringItems: RecurringItem[] = [
    {
      id: 'rec_salary',
      name: 'Salary',
      kind: 'income',
      amount: 120000,
      categoryId: salary.id,
      accountId: bank.id,
      dayOfMonth: 1,
      active: true,
      ...stamp()
    },
    {
      id: 'rec_rent',
      name: 'Rent',
      kind: 'bill',
      amount: 35000,
      categoryId: rent.id,
      accountId: bank.id,
      dayOfMonth: 3,
      active: true,
      ...stamp()
    },
    {
      id: 'rec_internet',
      name: 'Internet',
      kind: 'bill',
      amount: 1200,
      categoryId: utilities.id,
      accountId: bank.id,
      dayOfMonth: 12,
      active: true,
      ...stamp()
    }
  ];

  return {
    version: 1,
    currency: 'INR',
    accounts: [bank, cash, card],
    categories: [salary, food, rent, transport, utilities, shopping],
    transactions,
    budgets,
    recurringItems
  };
};
