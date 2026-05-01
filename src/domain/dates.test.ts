import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { getMonthKey, getMonthLabel, isDateInMonth, todayIsoDate } from './dates';

describe('dates utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('todayIsoDate', () => {
    it('returns today\'s date in ISO format', () => {
      const mockDate = new Date('2024-03-15T10:30:00Z');
      vi.setSystemTime(mockDate);

      expect(todayIsoDate()).toBe('2024-03-15');
    });

    it('handles different months correctly', () => {
      const mockDate = new Date('2024-12-31T23:59:59Z');
      vi.setSystemTime(mockDate);

      expect(todayIsoDate()).toBe('2024-12-31');
    });

    it('handles leap years correctly', () => {
      const mockDate = new Date('2024-02-29T12:00:00Z');
      vi.setSystemTime(mockDate);

      expect(todayIsoDate()).toBe('2024-02-29');
    });
  });

  describe('getMonthKey', () => {
    it('returns current month key when no date provided', () => {
      const mockDate = new Date('2024-03-15T10:30:00Z');
      vi.setSystemTime(mockDate);

      expect(getMonthKey()).toBe('2024-03');
    });

    it('returns month key for valid date string', () => {
      expect(getMonthKey('2024-03-15')).toBe('2024-03');
      expect(getMonthKey('2024-12-01')).toBe('2024-12');
      expect(getMonthKey('2024-01-31')).toBe('2024-01');
    });

    it('returns month key for Date object', () => {
      const date = new Date('2024-07-04T15:30:00Z');
      expect(getMonthKey(date)).toBe('2024-07');
    });

    it('handles single digit months with leading zero', () => {
      expect(getMonthKey('2024-01-01')).toBe('2024-01');
      expect(getMonthKey('2024-09-15')).toBe('2024-09');
    });

    it('handles edge cases', () => {
      expect(getMonthKey('2024-01-01')).toBe('2024-01');
      expect(getMonthKey('2024-12-31')).toBe('2024-12');
    });
  });

  describe('getMonthLabel', () => {
    it('returns formatted month label for valid month key', () => {
      expect(getMonthLabel('2024-01')).toBe('January 2024');
      expect(getMonthLabel('2024-12')).toBe('December 2024');
      expect(getMonthLabel('2023-06')).toBe('June 2023');
    });

    it('handles different years correctly', () => {
      expect(getMonthLabel('2023-01')).toBe('January 2023');
      expect(getMonthLabel('2025-12')).toBe('December 2025');
    });

    it('uses en-IN locale as specified', () => {
      // This test verifies the locale is being used correctly
      const label = getMonthLabel('2024-03');
      expect(label).toBe('March 2024');
    });
  });

  describe('isDateInMonth', () => {
    it('returns true when date is in the specified month', () => {
      expect(isDateInMonth('2024-03-15', '2024-03')).toBe(true);
      expect(isDateInMonth('2024-03-01', '2024-03')).toBe(true);
      expect(isDateInMonth('2024-03-31', '2024-03')).toBe(true);
    });

    it('returns false when date is not in the specified month', () => {
      expect(isDateInMonth('2024-03-15', '2024-04')).toBe(false);
      expect(isDateInMonth('2024-02-29', '2024-03')).toBe(false);
      expect(isDateInMonth('2023-03-15', '2024-03')).toBe(false);
    });

    it('handles edge cases', () => {
      expect(isDateInMonth('2024-12-31', '2024-12')).toBe(true);
      expect(isDateInMonth('2024-01-01', '2024-01')).toBe(true);
      expect(isDateInMonth('2024-02-29', '2024-02')).toBe(true);
    });

    it('handles invalid date formats gracefully', () => {
      expect(isDateInMonth('invalid-date', '2024-03')).toBe(false);
      expect(isDateInMonth('2024-13-01', '2024-03')).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('works together for common use cases', () => {
      const mockDate = new Date('2024-03-15T10:30:00Z');
      vi.setSystemTime(mockDate);

      const today = todayIsoDate();
      const monthKey = getMonthKey(today);
      const monthLabel = getMonthLabel(monthKey);
      const isInMonth = isDateInMonth(today, monthKey);

      expect(today).toBe('2024-03-15');
      expect(monthKey).toBe('2024-03');
      expect(monthLabel).toBe('March 2024');
      expect(isInMonth).toBe(true);
    });

    it('handles date arithmetic scenarios', () => {
      const dates = [
        '2024-01-31',
        '2024-02-28',
        '2024-02-29', // leap year
        '2024-03-01',
        '2024-12-31',
      ];

      dates.forEach(date => {
        const monthKey = getMonthKey(date);
        expect(isDateInMonth(date, monthKey)).toBe(true);
      });
    });
  });
});
