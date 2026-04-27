import type { FinanceData } from '../domain/types';
import { createSeedData } from './seedData';
import type { FinanceRepository } from './repository';

const STORAGE_KEY = 'money-map.finance-data.v1';

export class LocalStorageFinanceRepository implements FinanceRepository {
  async load(): Promise<FinanceData> {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedData();
      await this.save(seed);
      return seed;
    }

    try {
      const data = JSON.parse(raw) as FinanceData;
      if (data.version !== 1) throw new Error('Unsupported data version');
      return data;
    } catch {
      const seed = createSeedData();
      await this.save(seed);
      return seed;
    }
  }

  async save(data: FinanceData): Promise<void> {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
