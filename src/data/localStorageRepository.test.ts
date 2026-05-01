import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageFinanceRepository } from './localStorageRepository';
import { createSeedData } from './seedData';
import type { FinanceData } from '../domain/types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('LocalStorageFinanceRepository', () => {
  let repository: LocalStorageFinanceRepository;
  const STORAGE_KEY = 'money-map.finance-data.v1';

  beforeEach(() => {
    repository = new LocalStorageFinanceRepository();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('returns seed data when localStorage is empty', async () => {
      const data = await repository.load();

      expect(data).toEqual(createSeedData());
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        JSON.stringify(createSeedData())
      );
    });

    it('returns valid data from localStorage', async () => {
      const testData = createSeedData();
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(testData));

      const data = await repository.load();

      expect(data).toEqual(testData);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('falls back to seed data when localStorage contains invalid JSON', async () => {
      localStorageMock.setItem(STORAGE_KEY, 'invalid json');

      const data = await repository.load();

      expect(data).toEqual(createSeedData());
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        JSON.stringify(createSeedData())
      );
    });

    it('falls back to seed data when data version is unsupported', async () => {
      const invalidVersionData = { ...createSeedData(), version: 2 };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(invalidVersionData));

      const data = await repository.load();

      expect(data).toEqual(createSeedData());
      expect(data.version).toBe(1);
    });

    it('preserves existing valid data in localStorage', async () => {
      const customData: FinanceData = {
        ...createSeedData(),
        accounts: [
          {
            id: 'custom-account',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            name: 'Custom Account',
            type: 'bank',
            openingBalance: 5000,
            color: '#ff0000',
          },
        ],
      };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(customData));

      const data = await repository.load();

      expect(data.accounts).toHaveLength(1);
      expect(data.accounts[0].name).toBe('Custom Account');
    });
  });

  describe('save', () => {
    it('saves data to localStorage', async () => {
      const testData = createSeedData();

      await repository.save(testData);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        JSON.stringify(testData)
      );
    });

    it('handles save operations with large datasets', async () => {
      const largeData: FinanceData = {
        ...createSeedData(),
        transactions: Array.from({ length: 1000 }, (_, i) => ({
          id: `transaction-${i}`,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          date: '2024-01-01',
          type: 'expense' as const,
          amount: 100,
          categoryId: 'cat-food',
          accountId: 'acct_bank_primary',
          notes: `Transaction ${i}`,
        })),
      };

      await repository.save(largeData);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        JSON.stringify(largeData)
      );
    });
  });

  describe('integration scenarios', () => {
    it('maintains data consistency across load and save cycles', async () => {
      const originalData = await repository.load();
      
      // Modify the data
      originalData.accounts.push({
        id: 'new-account',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        name: 'New Account',
        type: 'cash',
        openingBalance: 1000,
        color: '#00ff00',
      });

      await repository.save(originalData);

      // Load again and verify
      const reloadedData = await repository.load();
      expect(reloadedData.accounts).toHaveLength(originalData.accounts.length);
      expect(reloadedData.accounts.find(a => a.id === 'new-account')).toBeDefined();
    });

    it('handles concurrent save operations', async () => {
      const data1 = await repository.load();
      const data2 = await repository.load();

      data1.accounts[0].name = 'Modified by operation 1';
      data2.accounts[0].name = 'Modified by operation 2';

      await repository.save(data1);
      await repository.save(data2);

      const finalData = await repository.load();
      expect(finalData.accounts[0].name).toBe('Modified by operation 2');
    });
  });
});
