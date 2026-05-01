import type {
  FinanceData,
  Account,
  Category,
  Transaction,
  MonthlyBudget,
  RecurringItem,
} from '../domain/types';
import type { FinanceRepository } from './repository';
import { supabase } from './supabaseClient';

const CURRENCY: 'INR' = 'INR';

export class SupabaseFinanceRepository implements FinanceRepository {
  async load(): Promise<FinanceData> {
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const [accountsRes, categoriesRes, transactionsRes, budgetsRes, recurringRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').eq('user_id', user.id),
      supabase.from('transactions').select('*').eq('user_id', user.id),
      supabase.from('budgets').select('*').eq('user_id', user.id),
      supabase.from('recurring_items').select('*').eq('user_id', user.id),
    ]);

    if (accountsRes.error) throw accountsRes.error;
    if (categoriesRes.error) throw categoriesRes.error;
    if (transactionsRes.error) throw transactionsRes.error;
    if (budgetsRes.error) throw budgetsRes.error;
    if (recurringRes.error) throw recurringRes.error;

    return {
      version: 1,
      currency: CURRENCY,
      accounts: (accountsRes.data || []).map(mapAccountFromDB),
      categories: (categoriesRes.data || []).map(mapCategoryFromDB),
      transactions: (transactionsRes.data || []).map(mapTransactionFromDB),
      budgets: (budgetsRes.data || []).map(mapBudgetFromDB),
      recurringItems: (recurringRes.data || []).map(mapRecurringFromDB),
    };
  }

  async save(data: FinanceData): Promise<void> {
    // Supabase repository saves data per-entity via upsert operations
    // This is called during sync operations
    await this.syncAll(data);
  }

  async syncAll(data: FinanceData): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const userId = user.id;

    await this.deleteMissingRecords(userId, 'transactions', data.transactions.map((transaction) => transaction.id));
    await this.deleteMissingRecords(userId, 'budgets', data.budgets.map((budget) => budget.id));
    await this.deleteMissingRecords(userId, 'recurring_items', data.recurringItems.map((item) => item.id));

    // Sync accounts
    for (const account of data.accounts) {
      await supabase.from('accounts').upsert({
        id: account.id,
        user_id: userId,
        name: account.name,
        type: account.type,
        opening_balance: account.openingBalance,
        color: account.color,
        archived: account.archived || false,
        created_at: account.createdAt,
        updated_at: account.updatedAt,
      }, { onConflict: 'id' });
    }

    // Sync categories
    for (const category of data.categories) {
      await supabase.from('categories').upsert({
        id: category.id,
        user_id: userId,
        name: category.name,
        kind: category.kind,
        color: category.color,
        archived: category.archived || false,
        created_at: category.createdAt,
        updated_at: category.updatedAt,
      }, { onConflict: 'id' });
    }

    // Sync transactions
    for (const transaction of data.transactions) {
      await supabase.from('transactions').upsert({
        id: transaction.id,
        user_id: userId,
        date: transaction.date,
        type: transaction.type,
        amount: transaction.amount,
        category_id: transaction.categoryId,
        account_id: transaction.accountId,
        notes: transaction.notes,
        created_at: transaction.createdAt,
        updated_at: transaction.updatedAt,
      }, { onConflict: 'id' });
    }

    // Sync budgets
    for (const budget of data.budgets) {
      await supabase.from('budgets').upsert({
        id: budget.id,
        user_id: userId,
        month: budget.month,
        category_id: budget.categoryId,
        limit_amount: budget.limit,
        created_at: budget.createdAt,
        updated_at: budget.updatedAt,
      }, { onConflict: 'id' });
    }

    // Sync recurring items
    for (const item of data.recurringItems) {
      await supabase.from('recurring_items').upsert({
        id: item.id,
        user_id: userId,
        name: item.name,
        kind: item.kind,
        amount: item.amount,
        category_id: item.categoryId,
        account_id: item.accountId,
        day_of_month: item.dayOfMonth,
        active: item.active,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      }, { onConflict: 'id' });
    }

    await this.deleteMissingRecords(userId, 'categories', data.categories.map((category) => category.id));
    await this.deleteMissingRecords(userId, 'accounts', data.accounts.map((account) => account.id));
  }

  async migrateFromLocal(localData: FinanceData): Promise<void> {
    await this.syncAll(localData);
  }

  private async deleteMissingRecords(userId: string, table: string, keepIds: string[]): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not configured');
    }

    const { data: currentRows, error: selectError } = await supabase
      .from(table)
      .select('id')
      .eq('user_id', userId);
    if (selectError) throw selectError;

    const keep = new Set(keepIds);
    const staleIds = (currentRows ?? [])
      .map((row: { id: string }) => row.id)
      .filter((id: string) => !keep.has(id));

    if (!staleIds.length) return;

    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)
      .in('id', staleIds);
    if (deleteError) throw deleteError;
  }
}

// DB to Domain mappers
function mapAccountFromDB(db: any): Account {
  return {
    id: db.id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id,
    name: db.name,
    type: db.type,
    openingBalance: Number(db.opening_balance),
    color: db.color,
    archived: db.archived,
  };
}

function mapCategoryFromDB(db: any): Category {
  return {
    id: db.id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id,
    name: db.name,
    kind: db.kind,
    color: db.color,
    archived: db.archived,
  };
}

function mapTransactionFromDB(db: any): Transaction {
  return {
    id: db.id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id,
    date: db.date,
    type: db.type,
    amount: Number(db.amount),
    categoryId: db.category_id,
    accountId: db.account_id,
    notes: db.notes,
  };
}

function mapBudgetFromDB(db: any): MonthlyBudget {
  return {
    id: db.id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id,
    month: db.month,
    categoryId: db.category_id,
    limit: Number(db.limit_amount),
  };
}

function mapRecurringFromDB(db: any): RecurringItem {
  return {
    id: db.id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    userId: db.user_id,
    name: db.name,
    kind: db.kind,
    amount: Number(db.amount),
    categoryId: db.category_id,
    accountId: db.account_id,
    dayOfMonth: db.day_of_month,
    active: db.active,
  };
}
