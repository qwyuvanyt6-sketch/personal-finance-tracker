import { describe, expect, it } from 'vitest';
import { createSeedData } from './seedData';
import type { FinanceData } from '../domain/types';

describe('seedData', () => {
  describe('createSeedData', () => {
    it('returns valid FinanceData structure', () => {
      const data = createSeedData();

      expect(data).toHaveProperty('version', 1);
      expect(data).toHaveProperty('currency', 'INR');
      expect(data).toHaveProperty('accounts');
      expect(data).toHaveProperty('categories');
      expect(data).toHaveProperty('transactions');
      expect(data).toHaveProperty('budgets');
      expect(data).toHaveProperty('recurringItems');
    });

    it('creates expected number of seed records', () => {
      const data = createSeedData();

      expect(data.accounts).toHaveLength(3);
      expect(data.categories).toHaveLength(8);
      expect(data.transactions).toHaveLength(5);
      expect(data.budgets).toHaveLength(4);
      expect(data.recurringItems).toHaveLength(3);
    });

    it('creates valid accounts with required properties', () => {
      const data = createSeedData();
      
      data.accounts.forEach(account => {
        expect(account).toHaveProperty('id');
        expect(account).toHaveProperty('createdAt');
        expect(account).toHaveProperty('updatedAt');
        expect(account).toHaveProperty('name');
        expect(account).toHaveProperty('type');
        expect(account).toHaveProperty('openingBalance');
        expect(account).toHaveProperty('color');
        
        expect(['cash', 'bank', 'card']).toContain(account.type);
        expect(typeof account.openingBalance).toBe('number');
        expect(account.openingBalance).toBeGreaterThanOrEqual(0);
        expect(account.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });

    it('creates different account types', () => {
      const data = createSeedData();
      const accountTypes = data.accounts.map(a => a.type);
      
      expect(accountTypes).toContain('cash');
      expect(accountTypes).toContain('bank');
      expect(accountTypes).toContain('card');
    });

    it('creates valid categories with required properties', () => {
      const data = createSeedData();
      
      data.categories.forEach(category => {
        expect(category).toHaveProperty('id');
        expect(category).toHaveProperty('createdAt');
        expect(category).toHaveProperty('updatedAt');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('kind');
        expect(category).toHaveProperty('color');
        
        expect(['income', 'expense']).toContain(category.kind);
        expect(category.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });

    it('creates both income and expense categories', () => {
      const data = createSeedData();
      const incomeCategories = data.categories.filter(c => c.kind === 'income');
      const expenseCategories = data.categories.filter(c => c.kind === 'expense');
      
      expect(incomeCategories.length).toBeGreaterThan(0);
      expect(expenseCategories.length).toBeGreaterThan(0);
    });

    it('creates valid transactions with required properties', () => {
      const data = createSeedData();
      
      data.transactions.forEach(transaction => {
        expect(transaction).toHaveProperty('id');
        expect(transaction).toHaveProperty('createdAt');
        expect(transaction).toHaveProperty('updatedAt');
        expect(transaction).toHaveProperty('date');
        expect(transaction).toHaveProperty('type');
        expect(transaction).toHaveProperty('amount');
        expect(transaction).toHaveProperty('categoryId');
        expect(transaction).toHaveProperty('accountId');
        expect(transaction).toHaveProperty('notes');
        
        expect(['income', 'expense']).toContain(transaction.type);
        expect(typeof transaction.amount).toBe('number');
        expect(transaction.amount).toBeGreaterThan(0);
        expect(transaction.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        
        // Verify references exist
        expect(data.categories.find(c => c.id === transaction.categoryId)).toBeDefined();
        expect(data.accounts.find(a => a.id === transaction.accountId)).toBeDefined();
      });
    });

    it('creates valid budgets with required properties', () => {
      const data = createSeedData();
      
      data.budgets.forEach(budget => {
        expect(budget).toHaveProperty('id');
        expect(budget).toHaveProperty('createdAt');
        expect(budget).toHaveProperty('updatedAt');
        expect(budget).toHaveProperty('month');
        expect(budget).toHaveProperty('categoryId');
        expect(budget).toHaveProperty('limit');
        
        expect(budget.month).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof budget.limit).toBe('number');
        expect(budget.limit).toBeGreaterThan(0);
        
        // Verify category exists
        expect(data.categories.find(c => c.id === budget.categoryId)).toBeDefined();
      });
    });

    it('creates valid recurring items with required properties', () => {
      const data = createSeedData();
      
      data.recurringItems.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('createdAt');
        expect(item).toHaveProperty('updatedAt');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('kind');
        expect(item).toHaveProperty('amount');
        expect(item).toHaveProperty('categoryId');
        expect(item).toHaveProperty('accountId');
        expect(item).toHaveProperty('dayOfMonth');
        expect(item).toHaveProperty('active');
        
        expect(['income', 'bill']).toContain(item.kind);
        expect(typeof item.amount).toBe('number');
        expect(item.amount).toBeGreaterThan(0);
        expect(item.dayOfMonth).toBeGreaterThanOrEqual(1);
        expect(item.dayOfMonth).toBeLessThanOrEqual(31);
        expect(typeof item.active).toBe('boolean');
        
        // Verify references exist
        expect(data.categories.find(c => c.id === item.categoryId)).toBeDefined();
        expect(data.accounts.find(a => a.id === item.accountId)).toBeDefined();
      });
    });

    it('maintains data consistency across related entities', () => {
      const data = createSeedData();
      
      // All transaction categories should exist
      data.transactions.forEach(transaction => {
        const category = data.categories.find(c => c.id === transaction.categoryId);
        expect(category).toBeDefined();
        expect(category?.kind).toBe(transaction.type);
      });
      
      // All budget categories should exist and be expense categories
      data.budgets.forEach(budget => {
        const category = data.categories.find(c => c.id === budget.categoryId);
        expect(category).toBeDefined();
        expect(category?.kind).toBe('expense');
      });
    });

    it('creates realistic financial scenario', () => {
      const data = createSeedData();
      
      const incomeTransactions = data.transactions.filter(t => t.type === 'income');
      const expenseTransactions = data.transactions.filter(t => t.type === 'expense');
      
      expect(incomeTransactions.length).toBeGreaterThan(0);
      expect(expenseTransactions.length).toBeGreaterThan(0);
      
      const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
      const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      expect(totalIncome).toBeGreaterThan(totalExpenses);
    });

    it('has consistent date formats', () => {
      const data = createSeedData();
      
      // Check transaction dates
      data.transactions.forEach(transaction => {
        expect(transaction.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
      
      // Check budget months
      data.budgets.forEach(budget => {
        expect(budget.month).toMatch(/^\d{4}-\d{2}$/);
      });
      
      // Check created/updated timestamps
      const allRecords = [
        ...data.accounts,
        ...data.categories,
        ...data.transactions,
        ...data.budgets,
        ...data.recurringItems,
      ];
      
      allRecords.forEach(record => {
        expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        expect(record.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      });
    });

    it('creates unique IDs for all records', () => {
      const data = createSeedData();
      
      const allIds = [
        ...data.accounts.map(a => a.id),
        ...data.categories.map(c => c.id),
        ...data.transactions.map(t => t.id),
        ...data.budgets.map(b => b.id),
        ...data.recurringItems.map(r => r.id),
      ];
      
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });
});
