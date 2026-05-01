import { describe, expect, it } from 'vitest';
import { formatMoney, formatSignedMoney } from './format';

describe('format utilities', () => {
  describe('formatMoney', () => {
    it('formats positive amounts correctly', () => {
      expect(formatMoney(1000)).toBe('₹1,000');
      expect(formatMoney(100000)).toBe('₹1,00,000');
      expect(formatMoney(1234567)).toBe('₹12,34,567');
    });

    it('formats zero correctly', () => {
      expect(formatMoney(0)).toBe('₹0');
    });

    it('formats negative amounts correctly', () => {
      expect(formatMoney(-1000)).toBe('-₹1,000');
      expect(formatMoney(-50000)).toBe('-₹50,000');
    });

    it('handles decimal amounts correctly', () => {
      expect(formatMoney(1000.50)).toBe('₹1,001'); // rounded due to maximumFractionDigits: 0
      expect(formatMoney(1000.49)).toBe('₹1,000'); // rounded down
      expect(formatMoney(999.99)).toBe('₹1,000'); // rounded up
    });

    it('uses Indian numbering system', () => {
      expect(formatMoney(100000)).toBe('₹1,00,000');
      expect(formatMoney(1000000)).toBe('₹10,00,000');
      expect(formatMoney(10000000)).toBe('₹1,00,00,000');
    });

    it('handles very large numbers', () => {
      expect(formatMoney(1000000000)).toBe('₹1,00,00,00,000');
      expect(formatMoney(999999999999)).toBe('₹9,99,99,99,99,999');
    });

    it('handles very small decimal amounts', () => {
      expect(formatMoney(0.01)).toBe('₹0');
      expect(formatMoney(0.99)).toBe('₹1');
    });
  });

  describe('formatSignedMoney', () => {
    it('adds + prefix for positive amounts', () => {
      expect(formatSignedMoney(1000)).toBe('+₹1,000');
      expect(formatSignedMoney(50000)).toBe('+₹50,000');
    });

    it('displays negative amounts without + prefix', () => {
      expect(formatSignedMoney(-1000)).toBe('-₹1,000');
      expect(formatSignedMoney(-50000)).toBe('-₹50,000');
    });

    it('handles zero correctly', () => {
      expect(formatSignedMoney(0)).toBe('₹0');
    });

    it('applies same formatting rules as formatMoney', () => {
      const amount = 1234567.89;
      expect(formatSignedMoney(amount)).toBe('+' + formatMoney(amount));
      expect(formatSignedMoney(-amount)).toBe(formatMoney(-amount));
    });

    it('handles decimal rounding correctly', () => {
      expect(formatSignedMoney(1000.50)).toBe('+₹1,001');
      expect(formatSignedMoney(1000.49)).toBe('+₹1,000');
      expect(formatSignedMoney(-1000.50)).toBe('-₹1,001');
    });

    it('handles edge cases', () => {
      expect(formatSignedMoney(1)).toBe('+₹1');
      expect(formatSignedMoney(-1)).toBe('-₹1');
      expect(formatSignedMoney(0.99)).toBe('+₹1');
      expect(formatSignedMoney(-0.99)).toBe('-₹1');
    });
  });

  describe('integration scenarios', () => {
    it('maintains consistency across different amounts', () => {
      const amounts = [0, 1, -1, 100, -100, 1000, -1000, 100000, -100000];
      
      amounts.forEach(amount => {
        const formatted = formatMoney(amount);
        const signed = formatSignedMoney(amount);
        
        if (amount > 0) {
          expect(signed).toBe('+' + formatted);
        } else if (amount < 0) {
          expect(signed).toBe(formatted);
        } else {
          expect(signed).toBe(formatted);
        }
      });
    });

    it('handles financial calculations correctly', () => {
      const income = 120000;
      const expenses = 45000;
      const balance = income - expenses;
      
      expect(formatMoney(income)).toBe('₹1,20,000');
      expect(formatMoney(expenses)).toBe('₹45,000');
      expect(formatMoney(balance)).toBe('₹75,000');
      expect(formatSignedMoney(balance)).toBe('+₹75,000');
    });
  });
});
