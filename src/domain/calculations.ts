import type {
  Account,
  Category,
  FinanceData,
  MonthlyBudget,
  RecordId,
  Transaction
} from './types';
import { isDateInMonth } from './dates';

export type BudgetProgress = {
  budget: MonthlyBudget;
  category: Category;
  spent: number;
  remaining: number;
  percent: number;
};

export type CategorySpend = {
  category: Category;
  amount: number;
};

export type AccountBalance = {
  account: Account;
  balance: number;
};

export type MonthlySummary = {
  month: string;
  income: number;
  expenses: number;
  netActual: number;
  budgetLimit: number;
  budgetSpent: number;
  budgetRemaining: number;
  expectedIncome: number;
  expectedBills: number;
  projectedLeftover: number;
  budgetProgress: BudgetProgress[];
  topSpending: CategorySpend[];
  accountBalances: AccountBalance[];
};

export const byId = <T extends { id: RecordId }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]));

export const getTransactionsForMonth = (transactions: Transaction[], month: string) =>
  transactions.filter((transaction) => isDateInMonth(transaction.date, month));

export const getAccountBalances = (data: FinanceData): AccountBalance[] =>
  data.accounts
    .filter((account) => !account.archived)
    .map((account) => {
      const balance = data.transactions
        .filter((transaction) => transaction.accountId === account.id)
        .reduce((total, transaction) => {
          return total + (transaction.type === 'income' ? transaction.amount : -transaction.amount);
        }, account.openingBalance);

      return { account, balance };
    });

export const getMonthlySummary = (data: FinanceData, month: string): MonthlySummary => {
  const categories = byId(data.categories);
  const monthTransactions = getTransactionsForMonth(data.transactions, month);
  const expenseTransactions = monthTransactions.filter((transaction) => transaction.type === 'expense');
  const income = monthTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((total, transaction) => total + transaction.amount, 0);
  const expenses = expenseTransactions.reduce((total, transaction) => total + transaction.amount, 0);

  const spentByCategory = expenseTransactions.reduce<Record<RecordId, number>>((totals, transaction) => {
    totals[transaction.categoryId] = (totals[transaction.categoryId] ?? 0) + transaction.amount;
    return totals;
  }, {});

  const monthBudgets = data.budgets.filter((budget) => budget.month === month);
  const budgetProgress = monthBudgets
    .map((budget) => {
      const category = categories.get(budget.categoryId);
      if (!category) return null;
      const spent = spentByCategory[budget.categoryId] ?? 0;
      return {
        budget,
        category,
        spent,
        remaining: budget.limit - spent,
        percent: budget.limit > 0 ? Math.min(100, Math.round((spent / budget.limit) * 100)) : 0
      };
    })
    .filter((item): item is BudgetProgress => Boolean(item));

  const topSpending = Object.entries(spentByCategory)
    .map(([categoryId, amount]) => {
      const category = categories.get(categoryId);
      return category ? { category, amount } : null;
    })
    .filter((item): item is CategorySpend => Boolean(item))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const expectedIncome = data.recurringItems
    .filter((item) => item.active && item.kind === 'income')
    .reduce((total, item) => total + item.amount, 0);
  const expectedBills = data.recurringItems
    .filter((item) => item.active && item.kind === 'bill')
    .reduce((total, item) => total + item.amount, 0);
  const budgetLimit = monthBudgets.reduce((total, budget) => total + budget.limit, 0);

  return {
    month,
    income,
    expenses,
    netActual: income - expenses,
    budgetLimit,
    budgetSpent: expenses,
    budgetRemaining: budgetLimit - expenses,
    expectedIncome,
    expectedBills,
    projectedLeftover: expectedIncome - expectedBills - Math.max(expenses, budgetLimit),
    budgetProgress,
    topSpending,
    accountBalances: getAccountBalances(data)
  };
};
