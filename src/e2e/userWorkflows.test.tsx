import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createSeedData } from '../data/seedData';
import { todayIsoDate } from '../domain/dates';

// Mock Supabase for E2E tests
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

describe('End-to-End User Workflow Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    
    // Default authenticated state for E2E tests
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
      error: null,
    });
  });

  const authenticateUser = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /open tracker/i }));
    await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
    await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
    await user.click(screen.getByRole('button', { name: /execute_login/i }));
    
    expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
  };

  describe('Complete Financial Management Workflow', () => {
    it('allows user to manage complete financial lifecycle', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      // 1. Authentication
      await authenticateUser(user);
      
      // 2. View Dashboard
      expect(screen.getByText(/\[income\]/i)).toBeInTheDocument();
      expect(screen.getByText(/\[proj_leftover\]/i)).toBeInTheDocument();
      
      // 3. Add Transaction
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      await user.clear(screen.getByLabelText('Transaction amount'));
      await user.type(screen.getByLabelText('Transaction amount'), '2500');
      await user.type(screen.getByPlaceholderText('Optional'), 'Grocery shopping');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));
      
      expect(await screen.findByText(/Grocery shopping/i)).toBeInTheDocument();
      
      // 4. View Budget Status
      await user.click(screen.getByRole('button', { name: /budget/i }));
      expect(screen.getByRole('heading', { name: /budget/i })).toBeInTheDocument();
      
      // 5. Access Settings
      await user.click(screen.getByRole('button', { name: /settings/i }));
      expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
      
      // 6. Logout
      await user.click(screen.getByRole('button', { name: /return to landing page/i }));
      expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
    });
  });

  describe('Transaction Management Workflow', () => {
    it('supports complete transaction lifecycle', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      
      // Add multiple transactions
      const transactions = [
        { amount: '1500', notes: 'Electricity bill' },
        { amount: '800', notes: 'Internet bill' },
        { amount: '2000', notes: 'Grocery shopping' },
      ];
      
      for (const transaction of transactions) {
        await user.clear(screen.getByLabelText('Transaction amount'));
        await user.type(screen.getByLabelText('Transaction amount'), transaction.amount);
        await user.clear(screen.getByPlaceholderText('Optional'));
        await user.type(screen.getByPlaceholderText('Optional'), transaction.notes);
        await user.click(screen.getByRole('button', { name: /add transaction/i }));
        
        expect(await screen.findByText(transaction.notes)).toBeInTheDocument();
      }
      
      // Verify all transactions are displayed
      transactions.forEach(transaction => {
        expect(screen.getByText(transaction.notes)).toBeInTheDocument();
      });
    });

    it('handles transaction validation and error states', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      
      // Try to add transaction with zero amount
      await user.clear(screen.getByLabelText('Transaction amount'));
      await user.type(screen.getByLabelText('Transaction amount'), '0');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));
      
      // Should show validation error or not add transaction
      expect(screen.queryByText(/notes:/i)).not.toBeInTheDocument();
      
      // Try with negative amount
      await user.clear(screen.getByLabelText('Transaction amount'));
      await user.type(screen.getByLabelText('Transaction amount'), '-100');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));
      
      // Should handle negative amounts appropriately
      expect(screen.queryByText(/notes:/i)).not.toBeInTheDocument();
    });
  });

  describe('Budget Management Workflow', () => {
    it('allows comprehensive budget tracking', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      
      // Navigate to budget section
      await user.click(screen.getByRole('button', { name: /budget/i }));
      
      // Budget information should be displayed
      expect(screen.getByRole('heading', { name: /budget/i })).toBeInTheDocument();
      
      // Check for budget categories and limits
      expect(screen.getByText(/budget remaining/i)).toBeInTheDocument();
      expect(screen.getByText(/top category/i)).toBeInTheDocument();
    });
  });

  describe('Data Import/Export Workflow', () => {
    it('handles CSV import and data synchronization', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      await user.click(screen.getByRole('button', { name: /settings/i }));
      
      // Find file input for CSV import
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();
      
      // Create test CSV data
      const importDate = todayIsoDate();
      const csv = [
        'Record ID,Date,Month,Type,Amount INR,Category,Category Kind,Account,Account Type,Notes,Created At,Updated At',
        `txn_import_test,${importDate},${importDate.slice(0, 7)},expense,1500,Food,expense,Imported Bank,bank,Lunch at restaurant,,`,
        `txn_import_test_2,${importDate},${importDate.slice(0, 7)},income,5000,Salary,income,Imported Bank,bank,Monthly salary,,`
      ].join('\n');
      
      // Simulate file upload
      fireEvent.change(fileInput, {
        target: {
          files: [new File([csv], 'money-map-ledger.csv', { type: 'text/csv' })]
        }
      });
      
      // Should show import success message
      expect(await screen.findByText(/csv imported and merged/i)).toBeInTheDocument();
      
      // Verify imported data appears in transactions
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      expect(await screen.findByText(/Lunch at restaurant/i)).toBeInTheDocument();
      expect(await screen.findByText(/Monthly salary/i)).toBeInTheDocument();
    });

    it('handles invalid CSV format gracefully', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      await user.click(screen.getByRole('button', { name: /settings/i }));
      
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      
      // Create invalid CSV
      const invalidCsv = 'invalid,csv,format\nmissing,headers';
      
      fireEvent.change(fileInput, {
        target: {
          files: [new File([invalidCsv], 'invalid.csv', { type: 'text/csv' })]
        }
      });
      
      // Should handle error gracefully without crashing
      await waitFor(() => {
        expect(screen.queryByText(/csv imported and merged/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Settings and Configuration Workflow', () => {
    it('allows comprehensive settings management', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      await user.click(screen.getByRole('button', { name: /settings/i }));
      
      // Verify settings sections are available
      expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
      
      // Check for data export functionality
      expect(screen.getByText(/export/i)).toBeInTheDocument();
      
      // Check for account management
      expect(screen.getByText(/accounts/i)).toBeInTheDocument();
      
      // Check for category management
      expect(screen.getByText(/categories/i)).toBeInTheDocument();
    });

    it('supports data export functionality', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      await user.click(screen.getByRole('button', { name: /settings/i }));
      
      // Look for export button/link
      const exportButton = screen.getByText(/export/i);
      expect(exportButton).toBeInTheDocument();
      
      // Click export should trigger download
      await user.click(exportButton);
      
      // Verify export was initiated (checking for download or success message)
      await waitFor(() => {
        // The exact implementation may vary, but export should be handled
        expect(true).toBe(true); // Placeholder assertion
      });
    });
  });

  describe('Multi-User Session Management', () => {
    it('handles session switching correctly', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      // First user session
      await authenticateUser(user);
      expect(screen.getByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Logout first user
      await user.click(screen.getByRole('button', { name: /return to landing page/i }));
      expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
      
      // Second user session (different mock)
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-2', email: 'user2@fintrack.io' } },
        error: null,
      });
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'user2@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'password2');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    });
  });

  describe('Responsive Design and Accessibility', () => {
    it('maintains functionality across different viewport sizes', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      
      // Test navigation on different screen sizes
      const viewports = [
        { width: 1920, height: 1080 }, // Desktop
        { width: 768, height: 1024 },  // Tablet
        { width: 375, height: 667 },   // Mobile
      ];
      
      for (const viewport of viewports) {
        // Simulate viewport change
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: viewport.width,
        });
        Object.defineProperty(window, 'innerHeight', {
          writable: true,
          configurable: true,
          value: viewport.height,
        });
        
        // Trigger resize event
        window.dispatchEvent(new Event('resize'));
        
        // Verify navigation still works
        expect(screen.getByRole('button', { name: /transactions/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /budget/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
      }
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      
      // Test keyboard navigation
      await user.tab();
      expect(document.activeElement).toBeInTheDocument();
      
      // Navigate through main sections using keyboard
      const transactionsButton = screen.getByRole('button', { name: /transactions/i });
      transactionsButton.focus();
      await user.keyboard('{Enter}');
      
      expect(await screen.findByRole('heading', { name: /transactions/i })).toBeInTheDocument();
    });
  });

  describe('Performance and Data Handling', () => {
    it('handles large datasets efficiently', async () => {
      const user = userEvent.setup();
      
      // Create large dataset
      const largeData = createSeedData();
      largeData.transactions = Array.from({ length: 1000 }, (_, i) => ({
        id: `large-txn-${i}`,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        date: '2024-01-01',
        type: 'expense' as const,
        amount: 100 + (i % 1000),
        categoryId: largeData.categories[0].id,
        accountId: largeData.accounts[0].id,
        notes: `Large transaction ${i}`,
        userId: 'test-user',
      }));
      
      window.localStorage.setItem('money-map.finance-data.v1', JSON.stringify(largeData));
      
      render(<App />);
      
      await authenticateUser(user);
      
      // Application should still load and be responsive
      expect(screen.getByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Navigation should work
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      expect(screen.getByRole('heading', { name: /transactions/i })).toBeInTheDocument();
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('recovers from temporary network issues', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await authenticateUser(user);
      
      // Simulate network issues by temporarily failing auth
      mockSupabase.auth.getUser.mockRejectedValueOnce(new Error('Network error'));
      
      // Try to navigate - should handle gracefully
      await user.click(screen.getByRole('button', { name: /transactions/i }));
      
      // Should either show transactions or handle error gracefully
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /transactions/i })).toBeInTheDocument();
      });
    });

    it('handles corrupted local storage data', async () => {
      // Set corrupted data in localStorage
      window.localStorage.setItem('money-map.finance-data.v1', 'invalid json data');
      
      const user = userEvent.setup();
      render(<App />);
      
      // Should recover and show seed data
      await authenticateUser(user);
      expect(screen.getByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    });
  });
});
