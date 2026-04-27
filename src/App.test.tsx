import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders dashboard summary cards from local data', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Money Map' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /open tracker/i })[0]);

    expect(await screen.findByRole('heading', { name: /monthly_summary/i })).toBeInTheDocument();
    expect(screen.getByText(/\[income\]/i)).toBeInTheDocument();
    expect(screen.getByText(/\[proj_leftover\]/i)).toBeInTheDocument();
  });

  it('adds a manual transaction', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findAllByRole('button', { name: /open tracker/i }).then((buttons) => buttons[0]));
    await user.click(await screen.findByRole('button', { name: /transactions/i }));
    await user.clear(screen.getByLabelText('Transaction amount'));
    await user.type(screen.getByLabelText('Transaction amount'), '750');
    await user.type(screen.getByPlaceholderText('Optional'), 'Tea and snacks');
    await user.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => expect(screen.getByText(/Tea and snacks/i)).toBeInTheDocument());
  });
});
