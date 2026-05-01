import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

// Mock Supabase authentication
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

describe('Authentication Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    
    // Default mock implementations
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    
    mockSupabase.auth.signIn.mockResolvedValue({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      error: null,
    });
    
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
    
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  describe('Initial Authentication State', () => {
    it('shows landing page when user is not authenticated', async () => {
      render(<App />);
      
      expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open tracker/i })).toBeInTheDocument();
    });

    it('redirects to authentication when accessing tracker without login', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/user_email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/access_token/i)).toBeInTheDocument();
    });
  });

  describe('Login Flow', () => {
    it('authenticates user with valid credentials', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
        error: null,
      });
      
      render(<App />);
      
      // Navigate to login
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      // Fill credentials
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should redirect to dashboard
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    });

    it('shows error message with invalid credentials', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signIn.mockResolvedValue({
        data: { user: null },
        error: new Error('Invalid credentials'),
      });
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      await user.type(screen.getByLabelText(/user_email/i), 'invalid@email.com');
      await user.type(screen.getByLabelText(/access_token/i), 'wrong-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should show error and stay on login screen
      expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });

    it('handles empty credentials validation', async () => {
      const user = userEvent.setup();
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      // Try to login with empty fields
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should stay on login screen
      expect(screen.getByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });
  });

  describe('Session Persistence', () => {
    it('remembers user session when persist is enabled', async () => {
      const user = userEvent.setup();
      
      // Mock successful authentication
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
        error: null,
      });
      
      render(<App />);
      
      // Login with persist session
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByLabelText(/persist_session/i));
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Return to landing
      await user.click(screen.getByRole('button', { name: /return to landing page/i }));
      expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
      
      // Click sign in again - should skip login
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /system_login/i })).not.toBeInTheDocument();
    });

    it('does not persist session when persist is disabled', async () => {
      const user = userEvent.setup();
      
      render(<App />);
      
      // Login without persist session
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Return to landing
      await user.click(screen.getByRole('button', { name: /return to landing page/i }));
      expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
      
      // Click sign in again - should show login
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });
  });

  describe('Logout Flow', () => {
    it('logs out user and returns to landing page', async () => {
      const user = userEvent.setup();
      
      // Mock successful authentication
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
        error: null,
      });
      
      render(<App />);
      
      // Login
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Logout
      await user.click(screen.getByRole('button', { name: /return to landing page/i }));
      expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
    });
  });

  describe('Authentication Error Handling', () => {
    it('handles network errors during login', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.signIn.mockRejectedValue(new Error('Network error'));
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should stay on login screen
      expect(screen.getByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });

    it('handles authentication check failures', async () => {
      const user = userEvent.setup();
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Auth check failed'));
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      
      // Should still show login screen even on auth check failure
      expect(await screen.findByRole('heading', { name: /system_login/i })).toBeInTheDocument();
    });
  });

  describe('Multiple Authentication Attempts', () => {
    it('allows multiple login attempts', async () => {
      const user = userEvent.setup();
      
      // First attempt fails
      mockSupabase.auth.signIn.mockResolvedValueOnce({
        data: { user: null },
        error: new Error('Invalid credentials'),
      });
      
      render(<App />);
      
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'wrong@email.com');
      await user.type(screen.getByLabelText(/access_token/i), 'wrong-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      // Should stay on login screen
      expect(screen.getByRole('heading', { name: /system_login/i })).toBeInTheDocument();
      
      // Second attempt succeeds
      mockSupabase.auth.signIn.mockResolvedValueOnce({
        data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
        error: null,
      });
      
      await user.clear(screen.getByLabelText(/user_email/i));
      await user.clear(screen.getByLabelText(/access_token/i));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    });
  });

  describe('Authentication State Management', () => {
    it('maintains authentication state across component re-renders', async () => {
      const user = userEvent.setup();
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user', email: 'root@fintrack.io' } },
        error: null,
      });
      
      const { rerender } = render(<App />);
      
      // Login
      await user.click(screen.getByRole('button', { name: /open tracker/i }));
      await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
      await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
      await user.click(screen.getByRole('button', { name: /execute_login/i }));
      
      expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
      
      // Rerender component
      rerender(<App />);
      
      // Should still be authenticated
      expect(screen.getByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    });
  });
});
