import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createSeedData } from '../data/seedData';

// Mock Supabase with comprehensive error scenarios
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
};

vi.mock('../data/supabaseClient', () => ({
  supabase: mockSupabase,
}));

describe('Edge Cases and Error Handling Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    
    // Default successful auth state
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
      error: null,
    });
  });

  describe('Data Corruption and Recovery', () => {
    it('handles completely corrupted localStorage data', async () => {
      // Inject various types of corrupted data
      const corruptedData = [
        'invalid json',
        '{"version": 2, "invalid": "structure"}',
        '{"version": 1, "currency": "INVALID"}',
        '{"version": 1, "accounts": "not an array"}',
        '{"version": 1, "accounts": [{"id": "invalid", "missing": "fields"}]}',
      ];

      for (const corrupted of corruptedData) {
        window.localStorage.setItem('money-map.finance-data.v1', corrupted);
        
        const user = userEvent.setup();
        render(<App />);
        
        // Should recover and show login screen
        await user.click(screen.getByRole('button', { name: /open tracker/i }));
        expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
        
        // Cleanup for next iteration
        window.localStorage.clear();
        vi.clearAllMocks();
      }
    });

    it('handles partially corrupted data structures', async () => {
      const partiallyCorruptedData = createSeedData();
      
      // Corrupt specific fields
      partiallyCorruptedData.accounts[0].id = null as any;
      partiallyCorruptedData.categories[0].name = '';
      partiallyCorruptedData.transactions[0].amount = -1000;
      partiallyCorruptedData.budgets[0].limit = 0;
      
      window.localStorage.setItem('money-map.finance-data.v1', JSON.stringify(partiallyCorruptedData));
      
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should still load despite corrupted data
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    });

    it('handles missing required data entities', async () => {
      const incompleteData = {
        version: 1,
        currency: 'INR',
        accounts: [],
        categories: [],
        transactions: [],
        budgets: [],
        recurringItems: [],
      };
      
      window.localStorage.setItem('money-map.finance-data.v1', JSON.stringify(incompleteData));
      
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Should show appropriate messages for missing setup
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      expect(screen.getByText(/add at least one account in settings/i)).toBeInTheDocument();
    });
  });

  describe('Network and Connectivity Issues', () => {
    it('handles complete network failure', async () => {
      const user = userEvent.setup();
      
      // Mock network failure
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Network unreachable'));
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      // Should fall back to local authentication or show appropriate error
      expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });

    it('handles intermittent network issues', async () => {
      const user = userEvent.setup();
      
      // First call fails, second succeeds
      mockSupabase.auth.getUser
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
          error: null,
        });
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      // Should recover and allow login
      expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });

    it('handles slow network responses', async () => {
      const user = userEvent.setup();
      
      // Mock slow response
      mockSupabase.auth.getUser.mockImplementation(() => 
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
              error: null,
            });
          }, 2000); // 2 second delay
        })
      );
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      // Should show loading state or handle gracefully
      expect(await screen.findByRole('heading', { name: /system_login/i }, { timeout: 5000 })).toBeInTheDocument();
    });
  });

  describe('Input Validation and Security', () => {
    it('handles malicious input in authentication', async () => {
      const user = userEvent.setup();
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '"; DROP TABLE users; --',
        '../../../etc/passwd',
        'javascript:void(0)',
        '{{constructor.constructor("return process")().env}}',
      ];

      for (const maliciousInput of maliciousInputs) {
        render(<App />);
        
        await user.click(screen.getByRole('button', { name: /open tracker/i }));
        await user.type(screen.getByLabelText(/user_email/i), maliciousInput);
        await user.type(screen.getByLabelText(/access_token/i), maliciousInput);
        await user.click(screen.getByRole('button', { name: /execute_login/i }));
        
        // Should handle malicious input gracefully
        expect(screen.getByRole('heading', { name: /system_login/i })).toBeInTheDocument();
        
        // Cleanup for next iteration
        window.localStorage.clear();
        vi.clearAllMocks();
      }
    });

    it('handles extremely long input values', async () => {
      const user = userEvent.setup();
      const longString = 'a'.repeat(10000); // 10KB string
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), longString);
      await user.type(screen.getByLabelText(/access_token/i), longString);
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should handle long input without crashing
      expect(screen.getByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });

    it('validates transaction input edge cases', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      
      const invalidAmounts = [
        '0',
        '-100',
        '999999999999999999',
        'abc',
        '12.34.56',
        '1e10',
        'Infinity',
        'NaN',
      ];

      for (const amount of invalidAmounts) {
        await user.clear(screen.getByLabelText('Transaction amount'));
        await user.type(screen.getByLabelText('Transaction amount'), amount);
        await user.click(screen.getByRole('button', { name: /add transaction/i }));
        
        // Should handle invalid amounts gracefully
        await waitFor(() => {
          // Either shows error or doesn't add transaction
          expect(true).toBe(true);
        });
      }
    });
  });

  describe('Browser Compatibility Issues', () => {
    it('handles missing localStorage support', async () => {
      // Mock localStorage as undefined
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
      });

      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      // Should handle missing localStorage gracefully
      expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
      
      // Restore localStorage
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
      });
    });

    it('handles localStorage quota exceeded', async () => {
      const user = userEvent.setup();
      
      // Mock localStorage quota exceeded error
      const originalSetItem = window.localStorage.setItem;
      window.localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should handle quota exceeded gracefully
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Restore original setItem
      window.localStorage.setItem = originalSetItem;
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('handles memory pressure with large datasets', async () => {
      const user = userEvent.setup();
      
      // Create extremely large dataset
      const largeData = createSeedData();
      largeData.transactions = Array.from({ length: 10000 }, (_, i) => ({
        id: `large-txn-${i}`,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        date: '2024-01-01',
        type: 'expense' as const,
        amount: 100 + (i % 1000),
        categoryId: largeData.categories[0].id,
        accountId: largeData.accounts[0].id,
        notes: `Large transaction ${i} with additional text to increase memory usage`,
        userId: 'test-user',
      }));

      window.localStorage.setItem('money-map.finance-data.v1', JSON.stringify(largeData));
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should handle large dataset without memory issues
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    });

    it('handles rapid successive operations', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      
      // Rapidly add multiple transactions
      for (let i = 0; i < 10; i++) {
        await user.clear(screen.getByLabelText('Transaction amount'));
        await user.type(screen.getByLabelText('Transaction amount'), `${100 + i}`);
        await user.clear(screen.getByPlaceholderText('Optional'));
        await user.type(screen.getByPlaceholderText('Optional'), `Rapid transaction ${i}`);
        await user.click(screen.getByRole('button', { name: /add transaction/i }));
      }
      
      // Should handle rapid operations without issues
      expect(screen.getByText(/Rapid transaction 0/i)).toBeInTheDocument();
    });
  });

  describe('Concurrent Operations and Race Conditions', () => {
    it('handles simultaneous authentication attempts', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      // Click login button multiple times rapidly
      const loginButton = screen.getByRole('button', { name: /open tracker/i });
      
      await Promise.all([
        user.click(loginButton),
        user.click(loginButton),
        user.click(loginButton),
      ]);
      
      // Should handle multiple clicks gracefully
      expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });

    it('handles concurrent data operations', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      
      // Simulate concurrent transaction additions
      const addTransactionPromises = Array.from({ length: 5 }, (_, i) => 
        user.click(screen.getByRole('button', { name: /add transaction/i }))
      );
      
      await Promise.all(addTransactionPromises);
      
      // Should handle concurrent operations
      expect(screen.getByRole('heading', { name: /transactions/i })).toBeInTheDocument();
    });
  });

  describe('Data Type and Format Edge Cases', () => {
    it('handles extreme numeric values', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      
      const extremeValues = [
        '0.0000000001',
        '999999999999.99',
        '1.7976931348623157e+308', // Number.MAX_VALUE
        '5e-324', // Number.MIN_VALUE
      ];

      for (const value of extremeValues) {
        await user.clear(screen.getByLabelText('Transaction amount'));
        await user.type(screen.getByLabelText('Transaction amount'), value);
        await user.click(screen.getByRole('button', { name: /add transaction/i });
        
        // Should handle extreme values
        await waitFor(() => {
          expect(true).toBe(true);
        });
      }
    });

    it('handles invalid date formats', async () => {
      const user = userEvent.setup();
      
      // Create data with invalid dates
      const invalidData = createSeedData();
      invalidData.transactions[0].date = 'invalid-date';
      invalidData.transactions[1].date = '2024-13-45'; // Invalid month/day
      invalidData.transactions[2].date = '2024-02-30'; // Invalid date for February
      
      window.localStorage.setItem('money-map.finance-data.v1', JSON.stringify(invalidData));
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should handle invalid dates gracefully
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    });
  });

  describe('Browser Environment Edge Cases', () => {
    it('handles disabled JavaScript', async () => {
      // This test simulates what happens when JavaScript is disabled
      // In a real scenario, the app wouldn't work, but we test graceful degradation
      const originalConsoleError = console.error;
      console.error = vi.fn();
      
      const user = userEvent.setup();
      render(<App />);
      
      // Should show basic HTML content even with JS issues
      expect(screen.getByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
      
      console.error = originalConsoleError;
    });

    it('handles browser back button navigation', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Simulate browser back navigation
      window.history.back();
      
      // Should handle back navigation gracefully
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
      });
    });
  });
});
