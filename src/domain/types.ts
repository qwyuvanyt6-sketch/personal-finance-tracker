export type RecordId = string;

export type CurrencyCode = 'INR';

export type TransactionType = 'income' | 'expense';

export type AccountType = 'cash' | 'bank' | 'card';

export type CategoryKind = 'income' | 'expense';

export type RecurringKind = 'income' | 'bill';

export type BaseRecord = {
  id: RecordId;
  createdAt: string;
  updatedAt: string;
  userId?: string;
};

export type Account = BaseRecord & {
  name: string;
  type: AccountType;
  openingBalance: number;
  color: string;
  archived?: boolean;
};

export type Category = BaseRecord & {
  name: string;
  kind: CategoryKind;
  color: string;
  archived?: boolean;
};

export type Transaction = BaseRecord & {
  date: string;
  type: TransactionType;
  amount: number;
  categoryId: RecordId;
  accountId: RecordId;
  notes: string;
};

export type MonthlyBudget = BaseRecord & {
  month: string;
  categoryId: RecordId;
  limit: number;
};

export type RecurringItem = BaseRecord & {
  name: string;
  kind: RecurringKind;
  amount: number;
  categoryId: RecordId;
  accountId: RecordId;
  dayOfMonth: number;
  active: boolean;
};

export type FinanceData = {
  version: 1;
  currency: CurrencyCode;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: MonthlyBudget[];
  recurringItems: RecurringItem[];
};
