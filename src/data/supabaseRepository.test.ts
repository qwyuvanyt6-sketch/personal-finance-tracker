import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseFinanceRepository } from './supabaseRepository';
import { createSeedData } from './seedData';
import type { FinanceData, Account, Category } from '../domain/types';

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

// Mock supabaseClient module
vi.mock('./supabaseClient', () => ({
  supabase: mockSupabase,
}));

describe('SupabaseFinanceRepository', () => {
  let repository: SupabaseFinanceRepository;
  let mockUser: { id: string };
  let mockData: FinanceData;

  beforeEach(() => {
    repository = new SupabaseFinanceRepository();
    mockUser = { id: 'test-user-id' };
    mockData = createSeedData();
    
    vi.clearAllMocks();
    
    // Setup default successful auth
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    // Setup default successful database responses
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    mockSupabase.from.mockReturnValue(mockQueryBuilder);
  });

  describe('load', () => {
    it('throws error when Supabase client is not configured', async () => {
      // Temporarily set supabase to undefined
      const { supabase } = require('./supabaseClient');
      require('./supabaseClient').supabase = null;

      const repo = new SupabaseFinanceRepository();
      
      await expect(repo.load()).rejects.toThrow('Supabase client not configured');

      // Restore
      require('./supabaseClient').supabase = supabase;
    });

    it('throws error when user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await expect(repository.load()).rejects.toThrow('User not authenticated');
    });

    it('loads and maps data from all tables successfully', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'test-account', name: 'Test Account' }],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await repository.load();

      expect(mockSupabase.auth.getUser).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledWith('accounts');
      expect(mockSupabase.from).toHaveBeenCalledWith('categories');
      expect(mockSupabase.from).toHaveBeenCalledWith('transactions');
      expect(mockSupabase.from).toHaveBeenCalledWith('budgets');
      expect(mockSupabase.from).toHaveBeenCalledWith('recurring_items');
      expect(result.version).toBe(1);
      expect(result.currency).toBe('INR');
    });

    it('handles database errors gracefully', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('Database connection failed'),
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      await expect(repository.load()).rejects.toThrow('Database connection failed');
    });

    it('handles empty data sets', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await repository.load();

      expect(result.accounts).toHaveLength(0);
      expect(result.categories).toHaveLength(0);
      expect(result.transactions).toHaveLength(0);
      expect(result.budgets).toHaveLength(0);
      expect(result.recurringItems).toHaveLength(0);
    });
  });

  describe('save', () => {
    it('calls syncAll method', async () => {
      const syncAllSpy = vi.spyOn(repository, 'syncAll').mockResolvedValue();

      await repository.save(mockData);

      expect(syncAllSpy).toHaveBeenCalledWith(mockData);
    });
  });

  describe('syncAll', () => {
    it('throws error when user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await expect(repository.syncAll(mockData)).rejects.toThrow('User not authenticated');
    });

    it('scopes data to user before syncing', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        delete: vi.fn().mockResolvedValue({ error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      await repository.syncAll(mockData);

      // Verify that upsert is called for each data type
      expect(mockSupabase.from).toHaveBeenCalledWith('accounts');
      expect(mockSupabase.from).toHaveBeenCalledWith('categories');
      expect(mockSupabase.from).toHaveBeenCalledWith('transactions');
      expect(mockSupabase.from).toHaveBeenCalledWith('budgets');
      expect(mockSupabase.from).toHaveBeenCalledWith('recurring_items');
    });

    it('handles upsert errors', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        delete: vi.fn().mockResolvedValue({ error: null }),
        upsert: vi.fn().mockResolvedValue({
          error: new Error('Upsert failed'),
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      await expect(repository.syncAll(mockData)).rejects.toThrow('Upsert failed');
    });

    it('properly maps account data for database', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        delete: vi.fn().mockResolvedValue({ error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      await repository.syncAll(mockData);

      // Verify account mapping
      expect(mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUser.id,
          name: expect.any(String),
          type: expect.any(String),
          opening_balance: expect.any(Number),
          color: expect.any(String),
        }),
        { onConflict: 'id' }
      );
    });
  });

  describe('migrateFromLocal', () => {
    it('calls syncAll with local data', async () => {
      const syncAllSpy = vi.spyOn(repository, 'syncAll').mockResolvedValue();

      await repository.migrateFromLocal(mockData);

      expect(syncAllSpy).toHaveBeenCalledWith(mockData);
    });
  });

  describe('data mapping functions', () => {
    it('correctly maps account data from database format', async () => {
      const dbAccount = {
        id: 'test-account',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        user_id: 'test-user',
        name: 'Test Account',
        type: 'bank',
        opening_balance: '1000.50',
        color: '#ff0000',
        archived: false,
      };

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [dbAccount],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await repository.load();

      expect(result.accounts[0]).toEqual({
        id: 'test-account',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        userId: 'test-user',
        name: 'Test Account',
        type: 'bank',
        openingBalance: 1000.50,
        color: '#ff0000',
        archived: false,
      });
    });

    it('correctly maps transaction data from database format', async () => {
      const dbTransaction = {
        id: 'test-transaction',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        user_id: 'test-user',
        date: '2024-01-01',
        type: 'expense',
        amount: '100.25',
        category_id: 'test-category',
        account_id: 'test-account',
        notes: 'Test transaction',
      };

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [dbTransaction],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const result = await repository.load();

      expect(result.transactions[0]).toEqual({
        id: 'test-transaction',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        userId: 'test-user',
        date: '2024-01-01',
        type: 'expense',
        amount: 100.25,
        categoryId: 'test-category',
        accountId: 'test-account',
        notes: 'Test transaction',
      });
    });
  });

  describe('error handling', () => {
    it('handles network timeouts gracefully', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Network timeout'));

      await expect(repository.load()).rejects.toThrow('Network timeout');
    });

    it('handles partial data failures', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValueOnce({
          data: [{ id: 'test-account' }],
          error: null,
        }).mockResolvedValueOnce({
          data: null,
          error: new Error('Categories table unavailable'),
        }),
      };

      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      await expect(repository.load()).rejects.toThrow('Categories table unavailable');
    });
  });
});
