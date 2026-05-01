import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { createSeedData } from './data/seedData';
import { todayIsoDate } from './domain/dates';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const openAuthenticatedTracker = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click((await screen.findAllByRole('button', { name: /open tracker/i }))[0]);

    expect(await screen.findByRole('heading', { name: /system_login/i }, { timeout: 4000 })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
    await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
    await user.click(screen.getByRole('button', { name: /execute_login/i }));

    expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
  };

  it('routes landing actions to the authentication terminal', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open tracker/i })[0]);

    expect(await screen.findByRole('heading', { name: /system_login/i }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByLabelText(/user_email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access_token/i)).toBeInTheDocument();
  });

  it('runs meaningful commands in the landing monitor terminal', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
    const terminal = screen.getByRole('textbox', { name: /interactive money map terminal/i });
    await user.click(terminal);
    await user.keyboard('budget{Enter}');

    expect(within(terminal).getByText('> budget')).toBeInTheDocument();
    expect(within(terminal).getByText(/budget remaining/i)).toBeInTheDocument();
    expect(within(terminal).getByText(/top category/i)).toBeInTheDocument();
  });

  it('renders dashboard summary cards from local data', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
    await openAuthenticatedTracker(user);

    expect(screen.getByText(/\[income\]/i)).toBeInTheDocument();
    expect(screen.getByText(/\[proj_leftover\]/i)).toBeInTheDocument();
  });

  it('skips authentication when persist session was enabled', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole('button', { name: /open tracker/i }))[0]);
    expect(await screen.findByRole('heading', { name: /system_login/i }, { timeout: 4000 })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/user_email/i), 'root@fintrack.io');
    await user.type(screen.getByLabelText(/access_token/i), 'demo-password');
    await user.click(screen.getByLabelText(/persist_session/i));
    await user.click(screen.getByRole('button', { name: /execute_login/i }));
    expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /return to landing page/i }));
    expect(await screen.findByRole('heading', { name: 'Money Map' }, { timeout: 4000 })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('heading', { name: /monthly_summary/i }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /system_login/i })).not.toBeInTheDocument();
  }, 12000);

  it('adds a manual transaction', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openAuthenticatedTracker(user);
    await user.click(await screen.findByRole('button', { name: /transactions/i }));
    await user.clear(screen.getByLabelText('Transaction amount'));
    await user.type(screen.getByLabelText('Transaction amount'), '750');
    await user.type(screen.getByPlaceholderText('Optional'), 'Tea and snacks');
    await user.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => expect(screen.getByText(/Tea and snacks/i)).toBeInTheDocument());
  });

  it('explains missing setup before adding a transaction', async () => {
    const user = userEvent.setup();
    const emptySetup = {
      ...createSeedData(),
      accounts: [],
      categories: [],
      transactions: [],
      budgets: [],
      recurringItems: []
    };
    window.localStorage.setItem('money-map.finance-data.v1', JSON.stringify(emptySetup));
    render(<App />);

    await openAuthenticatedTracker(user);
    await user.click(await screen.findByRole('button', { name: /transactions/i }));

    expect(screen.getByText(/add at least one account in settings/i)).toBeInTheDocument();
    expect(screen.getByText(/add at least one expense category in settings/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(await screen.findByText(/add an account in settings/i)).toBeInTheDocument();
  });

  it('imports transactions from Money Map CSV', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openAuthenticatedTracker(user);
    await user.click(await screen.findByRole('button', { name: /settings/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const importDate = todayIsoDate();
    const csv = [
      'Record ID,Date,Month,Type,Amount INR,Category,Category Kind,Account,Account Type,Notes,Created At,Updated At',
      `txn_csv_test,${importDate},${importDate.slice(0, 7)},expense,999,Books,expense,Imported Bank,bank,CSV book purchase,,`
    ].join('\n');
    fireEvent.change(fileInput, {
      target: {
        files: [new File([csv], 'money-map-ledger.csv', { type: 'text/csv' })]
      }
    });

    expect(await screen.findByText(/csv imported and merged/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /transactions/i }));
    expect(await screen.findByText(/CSV book purchase/i)).toBeInTheDocument();
  });
});
