import type {
  Account,
  Category,
  FinanceData,
  MonthlyBudget,
  RecurringItem,
  Transaction
} from '../domain/types';

export type FinanceRepository = {
  load(): Promise<FinanceData>;
  save(data: FinanceData): Promise<void>;
};

export type FinanceActions = {
  upsertAccount(account: Account): void;
  deleteAccount(id: string): void;
  upsertCategory(category: Category): void;
  deleteCategory(id: string): void;
  upsertTransaction(transaction: Transaction): void;
  deleteTransaction(id: string): void;
  upsertBudget(budget: MonthlyBudget): void;
  deleteBudget(id: string): void;
  upsertRecurringItem(item: RecurringItem): void;
  deleteRecurringItem(id: string): void;
  replaceData(data: FinanceData): void;
  resetDemoData(): void;
};
