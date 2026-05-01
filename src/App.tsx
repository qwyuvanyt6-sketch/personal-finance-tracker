import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Download,
  LayoutDashboard,
  ListPlus,
  LogOut,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCcw,
  Save,
  Settings,
  SquareTerminal,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react';
import { getMonthlySummary, type MonthlySummary } from './domain/calculations';
import { getMonthKey, getMonthLabel, todayIsoDate } from './domain/dates';
import { formatMoney, formatSignedMoney } from './domain/format';
import type {
  Account,
  AccountType,
  Category,
  CategoryKind,
  FinanceData,
  MonthlyBudget,
  RecurringItem,
  RecurringKind,
  Transaction,
  TransactionType
} from './domain/types';
import { LocalStorageFinanceRepository } from './data/localStorageRepository';
import { SupabaseFinanceRepository } from './data/supabaseRepository';
import { createSeedData, makeId } from './data/seedData';
import { supabase } from './data/supabaseClient';

type ViewKey = 'dashboard' | 'transactions' | 'budgets' | 'cashflow' | 'accounts' | 'settings';
type AppScreen = 'landing' | 'auth' | 'tracker';
type LandingTransitionPhase = 'idle' | 'leaving' | 'leaving-down';

const localRepository = new LocalStorageFinanceRepository();
let supabaseRepository: SupabaseFinanceRepository | null = null;
const LANDING_TRANSITION_EXIT_MS = 1150;
const LANDING_TRANSITION_RETURN_MS = 1150;
const REMEMBER_AUTH_KEY = 'money-map:remember-session';
const LOCAL_STORAGE_DATA_KEY = 'money-map.finance-data.v1';

const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'transactions', label: 'Transactions', icon: ReceiptText },
  { key: 'budgets', label: 'Budgets', icon: PiggyBank },
  { key: 'cashflow', label: 'Cash Flow', icon: CalendarDays },
  { key: 'accounts', label: 'Accounts', icon: Banknote },
  { key: 'settings', label: 'Settings', icon: Settings }
];

const accountTypeLabels: Record<AccountType, string> = {
  bank: 'Bank',
  cash: 'Cash',
  card: 'Card'
};

const colorOptions = ['#2563eb', '#059669', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#db2777', '#be123c'];

const blankTransaction = (data: FinanceData): Transaction => ({
  id: makeId('txn'),
  date: todayIsoDate(),
  type: 'expense',
  amount: 0,
  categoryId: data.categories.find((category) => category.kind === 'expense')?.id ?? data.categories[0]?.id ?? '',
  accountId: data.accounts[0]?.id ?? '',
  notes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const blankAccount = (): Account => ({
  id: makeId('acct'),
  name: '',
  type: 'bank',
  openingBalance: 0,
  color: colorOptions[0],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const blankCategory = (kind: CategoryKind): Category => ({
  id: makeId('cat'),
  name: '',
  kind,
  color: kind === 'income' ? '#0f766e' : '#ea580c',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const blankRecurring = (data: FinanceData): RecurringItem => ({
  id: makeId('rec'),
  name: '',
  kind: 'bill',
  amount: 0,
  categoryId: data.categories.find((category) => category.kind === 'expense')?.id ?? data.categories[0]?.id ?? '',
  accountId: data.accounts[0]?.id ?? '',
  dayOfMonth: 1,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const formatRangeDate = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
    .format(date)
    .replace(/ /g, '-')
    .toUpperCase();

const getMonthDateRange = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return `${formatRangeDate(start)} TO ${formatRangeDate(end)}`;
};

const hasFinanceRecords = (financeData: FinanceData) =>
  financeData.accounts.length > 0 ||
  financeData.categories.length > 0 ||
  financeData.transactions.length > 0 ||
  financeData.budgets.length > 0 ||
  financeData.recurringItems.length > 0;

const readInitialFinanceData = (): FinanceData => {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_DATA_KEY);
    if (!raw) return createSeedData();
    const parsed = JSON.parse(raw) as FinanceData;
    if (parsed.version !== 1 || !Array.isArray(parsed.transactions)) return createSeedData();
    return parsed;
  } catch {
    return createSeedData();
  }
};

const downloadFile = (contents: string, fileName: string, type: string) => {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizeKey = (value: string) => value.trim().toLowerCase();

const csvCell = (value: string | number | undefined) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const readUploadedFile = (file: File) => {
  if (typeof file.text === 'function') return file.text();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
};

const financeDataToCsv = (financeData: FinanceData) => {
  const accountsById = new Map(financeData.accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(financeData.categories.map((category) => [category.id, category]));
  const headers = [
    'Record ID',
    'Date',
    'Month',
    'Type',
    'Amount INR',
    'Category',
    'Category Kind',
    'Account',
    'Account Type',
    'Notes',
    'Created At',
    'Updated At'
  ];
  const rows = financeData.transactions
    .slice()
    .sort((a, b) => `${b.date}-${b.createdAt}`.localeCompare(`${a.date}-${a.createdAt}`))
    .map((transaction) => {
      const account = accountsById.get(transaction.accountId);
      const category = categoriesById.get(transaction.categoryId);
      return [
        transaction.id,
        transaction.date,
        transaction.date.slice(0, 7),
        transaction.type,
        transaction.amount,
        category?.name ?? '',
        category?.kind ?? transaction.type,
        account?.name ?? '',
        account?.type ?? '',
        transaction.notes,
        transaction.createdAt,
        transaction.updatedAt
      ].map(csvCell).join(',');
    });

  return [
    headers.map(csvCell).join(','),
    ...rows
  ].join('\n');
};

const csvToFinanceData = (text: string, current: FinanceData): FinanceData => {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) throw new Error('CSV has no transaction rows');

  const headers = rows[0].map((header) => normalizeKey(header));
  const getValue = (row: string[], names: string[]) => {
    const index = names.map(normalizeKey).map((name) => headers.indexOf(name)).find((value) => value >= 0);
    return index === undefined ? '' : row[index]?.trim() ?? '';
  };

  const now = new Date().toISOString();
  const accounts = [...current.accounts];
  const categories = [...current.categories];
  const transactions = [...current.transactions];
  const accountByName = new Map(accounts.map((account) => [normalizeKey(account.name), account]));
  const categoryByNameAndKind = new Map(categories.map((category) => [`${category.kind}:${normalizeKey(category.name)}`, category]));

  rows.slice(1).forEach((row) => {
    const date = getValue(row, ['Date', 'Transaction Date']);
    const type = normalizeKey(getValue(row, ['Type'])) === 'income' ? 'income' : 'expense';
    const amount = Number(getValue(row, ['Amount INR', 'Amount']).replace(/[₹,\s]/g, ''));
    if (!date || !Number.isFinite(amount) || amount <= 0) return;

    const accountName = getValue(row, ['Account', 'Account Name']) || 'Imported Account';
    const accountTypeRaw = normalizeKey(getValue(row, ['Account Type']));
    const accountType: AccountType = accountTypeRaw === 'cash' || accountTypeRaw === 'card' ? accountTypeRaw : 'bank';
    let account = accountByName.get(normalizeKey(accountName));
    if (!account) {
      account = {
        ...blankAccount(),
        id: makeId('acct_import'),
        name: accountName,
        type: accountType,
        openingBalance: 0,
        color: colorOptions[accounts.length % colorOptions.length],
        createdAt: now,
        updatedAt: now
      };
      accounts.push(account);
      accountByName.set(normalizeKey(account.name), account);
    }

    const categoryName = getValue(row, ['Category', 'Category Name']) || (type === 'income' ? 'Imported Income' : 'Imported Expense');
    const categoryKind = normalizeKey(getValue(row, ['Category Kind'])) === 'income' ? 'income' : type;
    const categoryKey = `${categoryKind}:${normalizeKey(categoryName)}`;
    let category = categoryByNameAndKind.get(categoryKey);
    if (!category) {
      category = {
        ...blankCategory(categoryKind as CategoryKind),
        id: makeId('cat_import'),
        name: categoryName,
        color: colorOptions[(categories.length + 2) % colorOptions.length],
        createdAt: now,
        updatedAt: now
      };
      categories.push(category);
      categoryByNameAndKind.set(categoryKey, category);
    }

    const importedId = getValue(row, ['Record ID', 'ID']);
    const transaction: Transaction = {
      id: importedId || makeId('txn_import'),
      date,
      type,
      amount,
      categoryId: category.id,
      accountId: account.id,
      notes: getValue(row, ['Notes', 'Description', 'Memo']),
      createdAt: getValue(row, ['Created At']) || now,
      updatedAt: new Date().toISOString()
    };
    const existingIndex = transactions.findIndex((item) => item.id === transaction.id);
    if (existingIndex >= 0) {
      transactions[existingIndex] = transaction;
    } else {
      transactions.push(transaction);
    }
  });

  return {
    ...current,
    accounts,
    categories,
    transactions
  };
};

const toTerminalLabel = (label: string) => label.toUpperCase().replace(/\s+/g, '_');

const upsertById = <T extends { id: string; updatedAt: string }>(items: T[], item: T) => {
  const stamped = { ...item, updatedAt: new Date().toISOString() };
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? stamped : current))
    : [stamped, ...items];
};

function App() {
  const initialData = useMemo(() => readInitialFinanceData(), []);
  const [data, setData] = useState<FinanceData | null>(initialData);
  const [screen, setScreen] = useState<AppScreen>('landing');
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [month, setMonth] = useState(getMonthKey());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionForm, setTransactionForm] = useState<Transaction | null>(() => blankTransaction(initialData));
  const [accountForm, setAccountForm] = useState<Account>(blankAccount());
  const [categoryForm, setCategoryForm] = useState<Category>(blankCategory('expense'));
  const [recurringForm, setRecurringForm] = useState<RecurringItem | null>(() => blankRecurring(initialData));
  const [toast, setToast] = useState('');
  const [systemTime, setSystemTime] = useState(() => new Date().toLocaleTimeString('en-GB'));
  const [isSupabaseAuthenticated, setIsSupabaseAuthenticated] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [rememberedSession, setRememberedSession] = useState(() => window.localStorage.getItem(REMEMBER_AUTH_KEY) === 'true');
  const [routeTransitionPhase, setRouteTransitionPhase] = useState<LandingTransitionPhase>('idle');
  const [landingBootSeen, setLandingBootSeen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const routeTransitionTimeoutsRef = useRef<number[]>([]);

  // Initialize repository and load data
  useEffect(() => {
    const init = async () => {
      // Check if user is authenticated with Supabase
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const cloudRepository = new SupabaseFinanceRepository();
          try {
            let cloudData = await cloudRepository.load();
            const localData = await localRepository.load();
            
            if (!hasFinanceRecords(cloudData)) {
              // If no cloud data, migrate all local data
              await cloudRepository.migrateFromLocal(localData);
              cloudData = await cloudRepository.load();
              setToast('LOADED: LOCAL_DATA_SAVED_TO_DATABASE');
            } else {
              // If cloud data exists, merge with any new local data
              const mergedData = mergeFinanceData(cloudData, localData);
              await cloudRepository.syncAll(mergedData);
              cloudData = await cloudRepository.load();
              setToast('LOADED: DATABASE_DATA_SYNCED');
            }
            
            supabaseRepository = cloudRepository;
            setData(cloudData);
            setTransactionForm(blankTransaction(cloudData));
            setRecurringForm(blankRecurring(cloudData));
            setIsSupabaseAuthenticated(true);
            setCurrentUserEmail(session.user.email ?? '');
            return;
          } catch (error) {
            console.error('Cloud data load failed:', error);
            supabaseRepository = null;
            setIsSupabaseAuthenticated(false);
            setCurrentUserEmail('');
            setToast('DATABASE_LOAD_FAILED: USING_LOCAL_BROWSER_DATA');
          }
        }
      }
      // Use localStorage as fallback
      const loaded = await localRepository.load();
      setData(loaded);
      setTransactionForm(blankTransaction(loaded));
      setRecurringForm(blankRecurring(loaded));
    };
    init();
  }, []);

  // Save data to appropriate repository
  useEffect(() => {
    if (!data) return;
    if (isSupabaseAuthenticated && supabaseRepository) {
      supabaseRepository.save(data).catch((error) => {
        console.error('Database save failed:', error);
        setToast('DATABASE_SAVE_FAILED: LOCAL_COPY_STILL_ACTIVE');
        // Fallback to local storage if database save fails
        localRepository.save(data);
      });
    } else {
      localRepository.save(data);
    }
  }, [data, isSupabaseAuthenticated]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const timer = window.setInterval(() => setSystemTime(new Date().toLocaleTimeString('en-GB')), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!data || !transactionForm) return;

    const activeAccounts = data.accounts.filter((account) => !account.archived);
    const categoriesForType = data.categories.filter(
      (category) => !category.archived && category.kind === transactionForm.type
    );
    const nextAccountId = activeAccounts.some((account) => account.id === transactionForm.accountId)
      ? transactionForm.accountId
      : activeAccounts[0]?.id ?? '';
    const nextCategoryId = categoriesForType.some((category) => category.id === transactionForm.categoryId)
      ? transactionForm.categoryId
      : categoriesForType[0]?.id ?? '';

    if (nextAccountId !== transactionForm.accountId || nextCategoryId !== transactionForm.categoryId) {
      setTransactionForm({
        ...transactionForm,
        accountId: nextAccountId,
        categoryId: nextCategoryId
      });
    }
  }, [data, transactionForm]);

  useEffect(() => {
    return () => {
      routeTransitionTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  const summary = useMemo(() => (data ? getMonthlySummary(data, month) : null), [data, month]);
  const monthRange = useMemo(() => getMonthDateRange(month), [month]);
  const categoriesById = useMemo(() => new Map(data?.categories.map((category) => [category.id, category]) ?? []), [data]);
  const accountsById = useMemo(() => new Map(data?.accounts.map((account) => [account.id, account]) ?? []), [data]);
  const markLandingBootSeen = useCallback(() => setLandingBootSeen(true), []);

  if (!data || !summary || !transactionForm || !recurringForm) {
    return <main className="loading-shell" aria-label="Loading Money Map" />;
  }

  const scheduleRouteTransitionStep = (callback: () => void, delay: number) => {
    const timeout = window.setTimeout(() => {
      routeTransitionTimeoutsRef.current = routeTransitionTimeoutsRef.current.filter((current) => current !== timeout);
      callback();
    }, delay);
    routeTransitionTimeoutsRef.current.push(timeout);
  };

  const transitionToScreen = (nextScreen: AppScreen) => {
    routeTransitionTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    routeTransitionTimeoutsRef.current = [];

    setRouteTransitionPhase('leaving');
    scheduleRouteTransitionStep(() => {
      setScreen(nextScreen);
      window.scrollTo(0, 0);
      setRouteTransitionPhase('leaving-down');
      scheduleRouteTransitionStep(() => setRouteTransitionPhase('idle'), LANDING_TRANSITION_RETURN_MS);
    }, LANDING_TRANSITION_EXIT_MS);
  };

  const routeTransitionOverlay = <PageTransitionOverlay phase={routeTransitionPhase} />;

  const goToLanding = () => transitionToScreen('landing');

  const goToAuth = () => {
    const shouldResumeSession = rememberedSession || window.localStorage.getItem(REMEMBER_AUTH_KEY) === 'true';
    transitionToScreen(shouldResumeSession ? 'tracker' : 'auth');
  };

  const goToTracker = async (rememberSession = false, authenticatedEmail = '') => {
    routeTransitionTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    routeTransitionTimeoutsRef.current = [];
    setRouteTransitionPhase('idle');

    if (rememberSession) {
      window.localStorage.setItem(REMEMBER_AUTH_KEY, 'true');
      setRememberedSession(true);
    } else {
      window.localStorage.removeItem(REMEMBER_AUTH_KEY);
      setRememberedSession(false);
    }

    setScreen('tracker');
    window.scrollTo(0, 0);
    if (authenticatedEmail) setCurrentUserEmail(authenticatedEmail);

    if (!supabase) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const cloudRepository = new SupabaseFinanceRepository();
    try {
      let cloudData = await cloudRepository.load();
      
      // Always sync current local data to ensure nothing is lost
      const localData = await localRepository.load();
      
      if (!hasFinanceRecords(cloudData)) {
        // If no cloud data, migrate all local data
        await cloudRepository.migrateFromLocal(localData);
        cloudData = await cloudRepository.load();
        setToast('SIGNED_IN: LOCAL_DATA_SAVED_TO_DATABASE');
      } else {
        // If cloud data exists, merge with any new local data
        const mergedData = mergeFinanceData(cloudData, localData);
        await cloudRepository.syncAll(mergedData);
        cloudData = await cloudRepository.load();
        setToast('SIGNED_IN: DATABASE_DATA_LOADED');
      }

      supabaseRepository = cloudRepository;
      setData(cloudData);
      setTransactionForm(blankTransaction(cloudData));
      setRecurringForm(blankRecurring(cloudData));
      setIsSupabaseAuthenticated(true);
      setCurrentUserEmail(session.user.email ?? '');
    } catch (error) {
      console.error('Database load failed:', error);
      supabaseRepository = null;
      setIsSupabaseAuthenticated(false);
      setCurrentUserEmail('');
      setToast('DATABASE_LOAD_FAILED: USING_LOCAL_BROWSER_DATA');
    }
  };

  if (screen === 'landing') {
    return (
      <>
        <LandingPage
          data={data}
          monthLabel={getMonthLabel(month)}
          onEnter={goToAuth}
          onBootSeen={markLandingBootSeen}
          showBoot={!landingBootSeen}
          summary={summary}
        />
        {routeTransitionOverlay}
      </>
    );
  }

  if (screen === 'auth') {
    return (
      <>
        <AuthPage onAuthenticated={goToTracker} onBack={goToLanding} />
        {routeTransitionOverlay}
      </>
    );
  }

  const updateData = (updater: (current: FinanceData) => FinanceData, message?: string) => {
    setData((current) => {
      if (!current) return current;
      return updater(current);
    });
    if (message) setToast(message);
  };

  const saveTransaction = () => {
    const missing = [];
    const activeAccounts = data.accounts.filter((account) => !account.archived);
    const categoriesForType = data.categories.filter(
      (category) => !category.archived && category.kind === transactionForm.type
    );

    if (!activeAccounts.some((account) => account.id === transactionForm.accountId)) missing.push('account');
    if (!categoriesForType.some((category) => category.id === transactionForm.categoryId)) {
      missing.push(`${transactionForm.type} category`);
    }
    if (transactionForm.amount <= 0) missing.push('valid amount');
    
    if (missing.length > 0) {
      if (!activeAccounts.length) {
        setToast('Add an account in Settings before creating transactions.');
      } else if (!categoriesForType.length) {
        setToast(`Add a ${transactionForm.type} category in Settings first.`);
      } else {
        setToast(`Missing: ${missing.join(', ')}`);
      }
      return;
    }
    updateData(
      (current) => ({
        ...current,
        transactions: upsertById(current.transactions, {
          ...transactionForm,
          amount: Number(transactionForm.amount),
          notes: transactionForm.notes.trim()
        })
      }),
      editingTransaction ? 'Transaction updated.' : 'Transaction added.'
    );
    setEditingTransaction(null);
    setTransactionForm(blankTransaction(data));
  };

  const saveBudget = (categoryId: string, limit: number) => {
    const existing = data.budgets.find((budget) => budget.month === month && budget.categoryId === categoryId);
    const budget: MonthlyBudget = existing ?? {
      id: makeId('budget'),
      month,
      categoryId,
      limit: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    updateData(
      (current) => ({
        ...current,
        budgets: upsertById(current.budgets, { ...budget, limit: Math.max(0, Number(limit) || 0) })
      }),
      'Budget saved.'
    );
  };

  const saveAccount = () => {
    if (!accountForm.name.trim()) {
      setToast('Name the account first.');
      return;
    }
    updateData(
      (current) => ({
        ...current,
        accounts: upsertById(current.accounts, {
          ...accountForm,
          name: accountForm.name.trim(),
          openingBalance: Number(accountForm.openingBalance) || 0
        })
      }),
      'Account saved.'
    );
    setAccountForm(blankAccount());
  };

  const saveCategory = () => {
    if (!categoryForm.name.trim()) {
      setToast('Name the category first.');
      return;
    }
    updateData(
      (current) => ({
        ...current,
        categories: upsertById(current.categories, { ...categoryForm, name: categoryForm.name.trim() })
      }),
      'Category saved.'
    );
    setCategoryForm(blankCategory(categoryForm.kind));
  };

  const saveRecurring = () => {
    if (!recurringForm.name.trim() || recurringForm.amount <= 0) {
      setToast('Add a recurring name and amount first.');
      return;
    }
    updateData(
      (current) => ({
        ...current,
        recurringItems: upsertById(current.recurringItems, {
          ...recurringForm,
          name: recurringForm.name.trim(),
          amount: Number(recurringForm.amount) || 0,
          dayOfMonth: Math.min(31, Math.max(1, Number(recurringForm.dayOfMonth) || 1))
        })
      }),
      'Recurring item saved.'
    );
    setRecurringForm(blankRecurring(data));
  };

  const exportCsv = () => {
    downloadFile(
      financeDataToCsv(data),
      `money-map-ledger-${todayIsoDate()}.csv`,
      'text/csv;charset=utf-8'
    );
    setToast('Professional CSV ledger exported.');
  };

  const exportJsonBackup = () => {
    downloadFile(
      JSON.stringify(data, null, 2),
      `money-map-complete-backup-${todayIsoDate()}.json`,
      'application/json'
    );
    setToast('Complete JSON backup exported.');
  };

  const importDataFile = async (file: File) => {
    try {
      const contents = await readUploadedFile(file);
      const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');
      if (isCsv) {
        const imported = csvToFinanceData(contents, data);
        updateData(() => imported, 'CSV imported and merged.');
        setTransactionForm(blankTransaction(imported));
        setRecurringForm(blankRecurring(imported));
        return;
      }

      const imported = JSON.parse(contents) as FinanceData;
      if (imported.version !== 1 || !Array.isArray(imported.transactions)) throw new Error('Invalid backup');
      updateData(() => imported, 'Backup imported.');
      setTransactionForm(blankTransaction(imported));
      setRecurringForm(blankRecurring(imported));
    } catch {
      setToast('That file could not be imported. Use Money Map CSV or JSON.');
    }
  };

  const resetDemoData = () => {
    const seed = createSeedData();
    updateData(() => seed, 'Demo data restored.');
    setTransactionForm(blankTransaction(seed));
    setRecurringForm(blankRecurring(seed));
  };

  const mergeFinanceData = (cloudData: FinanceData, localData: FinanceData): FinanceData => {
  // Merge accounts, categories, transactions, budgets, and recurring items
  // Prioritize cloud data but include any new local data
  const merged: FinanceData = {
    ...cloudData,
    accounts: mergeById(cloudData.accounts, localData.accounts),
    categories: mergeById(cloudData.categories, localData.categories),
    transactions: mergeById(cloudData.transactions, localData.transactions),
    budgets: mergeById(cloudData.budgets, localData.budgets),
    recurringItems: mergeById(cloudData.recurringItems, localData.recurringItems),
  };
  return merged;
};

const mergeById = <T extends { id: string; updatedAt: string }>(cloudItems: T[], localItems: T[]): T[] => {
  const merged = new Map<string, T>();
  
  // Add all cloud items
  cloudItems.forEach(item => merged.set(item.id, item));
  
  // Add or update with local items (local takes precedence if newer)
  localItems.forEach(item => {
    const existing = merged.get(item.id);
    if (!existing || new Date(item.updatedAt) > new Date(existing.updatedAt)) {
      merged.set(item.id, item);
    }
  });
  
  return Array.from(merged.values());
};

const signOutOfDatabase = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    supabaseRepository = null;
    setIsSupabaseAuthenticated(false);
    setCurrentUserEmail('');
    window.localStorage.removeItem(REMEMBER_AUTH_KEY);
    setRememberedSession(false);
    setToast('SIGNED_OUT: DATABASE_SESSION_CLOSED');
    setScreen('auth');
    window.scrollTo(0, 0);
  };

  const monthTransactions = data.transactions
    .filter((transaction) => transaction.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  const activeAccounts = data.accounts.filter((account) => !account.archived);
  const expenseCategories = data.categories.filter((category) => category.kind === 'expense' && !category.archived);
  const incomeCategories = data.categories.filter((category) => category.kind === 'income' && !category.archived);
  const formCategories = transactionForm.type === 'income' ? incomeCategories : expenseCategories;
  const recurringCategories =
    recurringForm.kind === 'income' ? incomeCategories : expenseCategories.length ? expenseCategories : data.categories;
  const transactionSetupIssues = [
    ...(!activeAccounts.length ? ['Add at least one account in Settings.'] : []),
    ...(!formCategories.length ? [`Add at least one ${transactionForm.type} category in Settings.`] : [])
  ];
  const transactionFormIssues = [
    ...transactionSetupIssues,
    ...(transactionForm.amount <= 0 ? ['Enter an amount greater than zero.'] : [])
  ];
  const dashboardTopSpend = summary.topSpending.slice(0, 4);
  const maxTopSpend = Math.max(...dashboardTopSpend.map((item) => item.amount), 1);
  const recentTransactions = monthTransactions.slice(0, 5);
  const sidebarUsername = currentUserEmail ? currentUserEmail.split('@')[0].toUpperCase() : 'LOCAL_GUEST';

  return (
    <>
      <div className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" onClick={goToLanding} type="button" aria-label="Return to landing page">
          <div className="brand-mark">
            <CircleDollarSign size={23} />
          </div>
          <div>
            <strong>FIN-TRACK_V1</strong>
            <span>&gt; INIT_LOCAL_STORAGE... [OK]</span>
          </div>
        </button>
        <div className="terminal-menu-label">// MAIN_MENU</div>
        <nav className="nav-list" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={activeView === item.key ? 'nav-item active' : 'nav-item'}
                onClick={() => setActiveView(item.key)}
                type="button"
              >
                <Icon size={18} />
                <span>&gt; {toTerminalLabel(item.label)}</span>
                {activeView === item.key && <small>ACTV</small>}
              </button>
            );
          })}
        </nav>
        <div className="terminal-config">
          <div className="terminal-menu-label">// SYSTEM_CONFIG</div>
          <dl>
            <div>
              <dt>STATUS:</dt>
              <dd>ONLINE</dd>
            </div>
            <div>
              <dt>CURRENCY:</dt>
              <dd>INR (₹)</dd>
            </div>
            <div>
              <dt>USER:</dt>
              <dd>{sidebarUsername}</dd>
            </div>
          </dl>
          {currentUserEmail && (
            <button className="logout-button" onClick={signOutOfDatabase} type="button">
              <LogOut size={15} />
              <span>LOGOUT</span>
            </button>
          )}
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h1>&gt;&gt; {activeView === 'dashboard' ? 'MONTHLY_SUMMARY' : toTerminalLabel(navItems.find((item) => item.key === activeView)?.label ?? '')}</h1>
            <p className="eyebrow">DATA_RANGE: {monthRange}</p>
          </div>
          <div className="topbar-controls">
            <span>SYS_TIME: <strong>{systemTime}</strong></span>
            <TerminalMonthPicker
              month={month}
              open={monthPickerOpen}
              onChange={(nextMonth) => {
                setMonth(nextMonth);
                setMonthPickerOpen(false);
              }}
              onToggle={() => setMonthPickerOpen((current) => !current)}
            />
          </div>
        </header>

        {activeView === 'dashboard' && (
          <section className="view-grid">
            <div className="metric-grid">
              <MetricCard label="[INCOME]" value={formatMoney(summary.income)} detail="+ 100% of Expected" badge="MTD" tone="green" icon={ArrowDownCircle} />
              <MetricCard label="[EXPENSES]" value={formatMoney(summary.expenses)} detail={`${summary.income ? Math.round((summary.expenses / summary.income) * 100) : 0}% of Income`} badge="MTD" tone="rose" icon={ArrowUpCircle} />
              <MetricCard label="[PROJ_LEFTOVER]" value={formatSignedMoney(summary.projectedLeftover)} detail="Based on recurring bills" badge="EST" tone="blue" icon={PiggyBank} />
            </div>

            <section className="panel budget-panel">
              <div className="panel-heading">
                <h2>&gt; BUDGET_REMAINING</h2>
                <button className="text-link" onClick={() => setActiveView('budgets')} type="button">VIEW_ALL</button>
              </div>
              <div className="budget-summary-line">
                <span>OVERALL_BUDGET</span>
                <strong>{formatMoney(summary.budgetRemaining)} / {formatMoney(summary.budgetLimit)} REMAINING</strong>
              </div>
              <div className="progress-track terminal-track">
                <span style={{ width: `${summary.budgetLimit ? Math.min(100, Math.round((summary.budgetSpent / summary.budgetLimit) * 100)) : 0}%` }} />
              </div>
              <div className="progress-list">
                {summary.budgetProgress.map((item) => (
                  <div className="progress-row" key={item.budget.id}>
                    <div className="row-title">
                      <span>[CAT: {item.category.name.toUpperCase()}]</span>
                      <strong>{formatMoney(item.spent)} / {formatMoney(item.budget.limit)}</strong>
                    </div>
                    <div className="progress-track terminal-track">
                      <span style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel spending-panel">
              <div className="panel-heading">
                <h2>&gt; TOP_SPENDING_CATEGORIES</h2>
                <span>▥</span>
              </div>
              <div className="top-spend-list">
                {dashboardTopSpend.map((item, index) => (
                  <div className="spending-row" key={item.category.id}>
                    <strong>{String(index + 1).padStart(2, '0')}.</strong>
                    <div>
                      <div className="spending-row-title">
                        <span>{item.category.name.toUpperCase()}</span>
                        <b>{formatMoney(item.amount)}</b>
                      </div>
                      <div className="spending-track">
                        <span style={{ width: `${Math.max(8, Math.round((item.amount / maxTopSpend) * 100))}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel account-panel">
              <div className="panel-heading">
                <h2>&gt; ACCOUNT_BALANCES</h2>
              </div>
              <div className="stack-list">
                {summary.accountBalances.map(({ account, balance }) => (
                  <div className="list-row" key={account.id}>
                    <span className="dot" style={{ background: account.color }} />
                    <span>{account.name}</span>
                    <strong>{formatMoney(balance)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel transaction-log-panel wide">
              <div className="panel-heading">
                <h2>&gt; RECENT_TRANSACTIONS_LOG</h2>
                <button className="primary-button compact" onClick={() => setActiveView('transactions')} type="button">+ NEW_TX</button>
              </div>
              <div className="transaction-table">
                <div className="transaction-table-head">
                  <span>DATE</span>
                  <span>TYPE</span>
                  <span>DESCRIPTION</span>
                  <span>CATEGORY</span>
                  <span>ACCOUNT</span>
                  <span>AMOUNT</span>
                </div>
                {recentTransactions.map((transaction) => {
                  const category = categoriesById.get(transaction.categoryId);
                  const account = accountsById.get(transaction.accountId);
                  return (
                    <div className="transaction-table-row" key={transaction.id}>
                      <span>{transaction.date}</span>
                      <span><b>{transaction.type === 'income' ? 'INC' : 'EXP'}</b></span>
                      <span>{transaction.notes || category?.name || 'Manual entry'}</span>
                      <span>{category?.name ?? 'Uncategorized'}</span>
                      <span>{account?.name ?? 'No account'}</span>
                      <span>{transaction.type === 'income' ? '+' : '-'} {formatMoney(transaction.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>
        )}

        {activeView === 'transactions' && (
          <section className="split-layout">
            <section className="panel form-panel">
              <div className="panel-heading">
                <h2>{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h2>
              </div>
              <div className="form-grid">
                <label>
                  <span>Type</span>
                  <select
                    value={transactionForm.type}
                    onChange={(event) => {
                      const type = event.target.value as TransactionType;
                      const category = (type === 'income' ? incomeCategories : expenseCategories)[0];
                      setTransactionForm({ ...transactionForm, type, categoryId: category?.id ?? '' });
                    }}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </label>
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={transactionForm.date}
                    onChange={(event) => setTransactionForm({ ...transactionForm, date: event.target.value })}
                  />
                </label>
                <label>
                  <span>Amount</span>
                  <input
                    aria-label="Transaction amount"
                    type="number"
                    min="0"
                    value={transactionForm.amount || ''}
                    onChange={(event) => setTransactionForm({ ...transactionForm, amount: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Account</span>
                  <select
                    value={transactionForm.accountId}
                    onChange={(event) => setTransactionForm({ ...transactionForm, accountId: event.target.value })}
                  >
                    <option value="" disabled>
                      {activeAccounts.length ? 'Select account' : 'Add account in Settings'}
                    </option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                <label className="full-span">
                  <span>Category</span>
                  <select
                    value={transactionForm.categoryId}
                    onChange={(event) => setTransactionForm({ ...transactionForm, categoryId: event.target.value })}
                  >
                    <option value="" disabled>
                      {formCategories.length ? 'Select category' : `Add ${transactionForm.type} category in Settings`}
                    </option>
                    {formCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="full-span">
                  <span>Notes</span>
                  <input
                    value={transactionForm.notes}
                    onChange={(event) => setTransactionForm({ ...transactionForm, notes: event.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <div className={`form-alert full-span ${transactionFormIssues.length ? 'warning' : 'ready'}`} role="status">
                  <strong>{transactionFormIssues.length ? 'Before adding' : 'Ready to add'}</strong>
                  <span>
                    {transactionFormIssues.length
                      ? transactionFormIssues.join(' ')
                      : `${transactionForm.type === 'income' ? 'Income' : 'Expense'} will be saved to ${
                          activeAccounts.find((account) => account.id === transactionForm.accountId)?.name ?? 'the selected account'
                        }.`}
                  </span>
                </div>
                <div className="button-row full-span">
                  <button className="primary-button" onClick={saveTransaction} type="button">
                    <Save size={17} />
                    <span>{editingTransaction ? 'Update' : 'Add'} transaction</span>
                  </button>
                  {transactionSetupIssues.length > 0 && (
                    <button className="secondary-button" onClick={() => setActiveView('settings')} type="button">
                      <Settings size={17} />
                      <span>Open settings</span>
                    </button>
                  )}
                  {editingTransaction && (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setEditingTransaction(null);
                        setTransactionForm(blankTransaction(data));
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>This Month</h2>
                <span>{monthTransactions.length} entries</span>
              </div>
              <div className="transaction-list">
                {monthTransactions.map((transaction) => {
                  const category = categoriesById.get(transaction.categoryId);
                  const account = accountsById.get(transaction.accountId);
                  return (
                    <div className="transaction-row" key={transaction.id}>
                      <button
                        className="transaction-main"
                        onClick={() => {
                          setEditingTransaction(transaction);
                          setTransactionForm(transaction);
                        }}
                        type="button"
                      >
                        <span className="dot" style={{ background: category?.color ?? '#64748b' }} />
                        <span>
                          <strong>{category?.name ?? 'Uncategorized'}</strong>
                          <small>{transaction.date} · {account?.name ?? 'No account'} · {transaction.notes || 'No notes'}</small>
                        </span>
                      </button>
                      <strong className={transaction.type === 'income' ? 'money-positive' : 'money-negative'}>
                        {transaction.type === 'income' ? '+' : '-'}{formatMoney(transaction.amount)}
                      </strong>
                      <button
                        className="icon-button danger"
                        aria-label={`Delete ${category?.name ?? 'transaction'}`}
                        onClick={() =>
                          updateData(
                            (current) => ({
                              ...current,
                              transactions: current.transactions.filter((item) => item.id !== transaction.id)
                            }),
                            'Transaction deleted.'
                          )
                        }
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </section>
        )}

        {activeView === 'budgets' && (
          <section className="panel wide">
            <div className="panel-heading">
              <h2>Monthly Category Budgets</h2>
              <span>{getMonthLabel(month)}</span>
            </div>
            <div className="budget-editor">
              {expenseCategories.map((category) => {
                const existing = data.budgets.find((budget) => budget.month === month && budget.categoryId === category.id);
                const spent = summary.budgetProgress.find((item) => item.category.id === category.id)?.spent ?? 0;
                return (
                  <div className="budget-row" key={category.id}>
                    <div className="row-title">
                      <span className="dot" style={{ background: category.color }} />
                      <span>{category.name}</span>
                      <small>{formatMoney(spent)} spent</small>
                    </div>
                    <input
                      aria-label={`${category.name} budget`}
                      type="number"
                      min="0"
                      defaultValue={existing?.limit ?? 0}
                      onBlur={(event) => saveBudget(category.id, Number(event.target.value))}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeView === 'cashflow' && (
          <section className="view-grid">
            <div className="metric-grid">
              <MetricCard label="Expected income" value={formatMoney(summary.expectedIncome)} tone="green" icon={ArrowUpCircle} />
              <MetricCard label="Fixed bills" value={formatMoney(summary.expectedBills)} tone="rose" icon={ReceiptText} />
              <MetricCard label="Budgeted spend" value={formatMoney(summary.budgetLimit)} tone="amber" icon={PiggyBank} />
              <MetricCard label="Forecast" value={formatSignedMoney(summary.projectedLeftover)} tone="blue" icon={CalendarDays} />
            </div>
            <section className="panel form-panel">
              <div className="panel-heading">
                <h2>Add Recurring Item</h2>
              </div>
              <div className="form-grid">
                <label>
                  <span>Kind</span>
                  <select
                    value={recurringForm.kind}
                    onChange={(event) => {
                      const kind = event.target.value as RecurringKind;
                      const category = (kind === 'income' ? incomeCategories : expenseCategories)[0];
                      setRecurringForm({ ...recurringForm, kind, categoryId: category?.id ?? '' });
                    }}
                  >
                    <option value="bill">Bill</option>
                    <option value="income">Income</option>
                  </select>
                </label>
                <label>
                  <span>Name</span>
                  <input value={recurringForm.name} onChange={(event) => setRecurringForm({ ...recurringForm, name: event.target.value })} />
                </label>
                <label>
                  <span>Amount</span>
                  <input
                    aria-label="Recurring amount"
                    type="number"
                    min="0"
                    value={recurringForm.amount || ''}
                    onChange={(event) => setRecurringForm({ ...recurringForm, amount: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Day</span>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={recurringForm.dayOfMonth}
                    onChange={(event) => setRecurringForm({ ...recurringForm, dayOfMonth: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Category</span>
                  <select
                    value={recurringForm.categoryId}
                    onChange={(event) => setRecurringForm({ ...recurringForm, categoryId: event.target.value })}
                  >
                    {recurringCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Account</span>
                  <select
                    value={recurringForm.accountId}
                    onChange={(event) => setRecurringForm({ ...recurringForm, accountId: event.target.value })}
                  >
                    {data.accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                <button className="primary-button full-span" onClick={saveRecurring} type="button">
                  <Plus size={17} />
                  <span>Add recurring item</span>
                </button>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Recurring Schedule</h2>
              </div>
              <div className="stack-list">
                {data.recurringItems.map((item) => (
                  <div className="list-row" key={item.id}>
                    <span className={item.kind === 'income' ? 'pill green' : 'pill rose'}>{item.kind}</span>
                    <span>{item.name} · day {item.dayOfMonth}</span>
                    <strong>{formatMoney(item.amount)}</strong>
                    <button
                      className="icon-button danger"
                      aria-label={`Delete ${item.name}`}
                      onClick={() =>
                        updateData(
                          (current) => ({
                            ...current,
                            recurringItems: current.recurringItems.filter((currentItem) => currentItem.id !== item.id)
                          }),
                          'Recurring item deleted.'
                        )
                      }
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </section>
        )}

        {activeView === 'accounts' && (
          <section className="split-layout">
            <section className="panel form-panel">
              <div className="panel-heading">
                <h2>Add Account</h2>
              </div>
              <div className="form-grid">
                <label>
                  <span>Name</span>
                  <input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} />
                </label>
                <label>
                  <span>Type</span>
                  <select
                    value={accountForm.type}
                    onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value as AccountType })}
                  >
                    {Object.entries(accountTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Opening Balance</span>
                  <input
                    type="number"
                    value={accountForm.openingBalance || ''}
                    onChange={(event) => setAccountForm({ ...accountForm, openingBalance: Number(event.target.value) })}
                  />
                </label>
                <label className="full-span">
                  <span>Color</span>
                  <ColorPicker value={accountForm.color} onChange={(color) => setAccountForm({ ...accountForm, color })} />
                </label>
                <button className="primary-button full-span" onClick={saveAccount} type="button">
                  <Save size={17} />
                  <span>Save account</span>
                </button>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Balances</h2>
              </div>
              <div className="stack-list">
                {summary.accountBalances.map(({ account, balance }) => (
                  <div className="list-row" key={account.id}>
                    <span className="dot" style={{ background: account.color }} />
                    <span>{account.name} · {accountTypeLabels[account.type]}</span>
                    <strong>{formatMoney(balance)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </section>
        )}

        {activeView === 'settings' && (
          <section className="split-layout">
            <section className="panel form-panel">
              <div className="panel-heading">
                <h2>Categories</h2>
              </div>
              <div className="form-grid">
                <label>
                  <span>Kind</span>
                  <select
                    value={categoryForm.kind}
                    onChange={(event) => setCategoryForm(blankCategory(event.target.value as CategoryKind))}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </label>
                <label>
                  <span>Name</span>
                  <input value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} />
                </label>
                <label className="full-span">
                  <span>Color</span>
                  <ColorPicker value={categoryForm.color} onChange={(color) => setCategoryForm({ ...categoryForm, color })} />
                </label>
                <button className="primary-button full-span" onClick={saveCategory} type="button">
                  <ListPlus size={17} />
                  <span>Add category</span>
                </button>
              </div>
              <div className="chip-list">
                {data.categories.map((category) => (
                  <span className="category-chip" key={category.id}>
                    <span className="dot" style={{ background: category.color }} />
                    {category.name}
                    <small>{category.kind}</small>
                  </span>
                ))}
              </div>
            </section>
            <section className="panel form-panel">
              <div className="panel-heading">
                <h2>Data Port</h2>
                <span>{isSupabaseAuthenticated ? 'Database sync active' : 'Local browser storage'}</span>
              </div>
              <p className="muted-copy">
                Export a clean Money Map ledger CSV for spreadsheets, or keep a complete JSON backup for full app restore.
              </p>
              <div className="button-stack">
                <button className="primary-button" onClick={exportCsv} type="button">
                  <Download size={17} />
                  <span>Export ledger CSV</span>
                </button>
                <button className="secondary-button" onClick={() => fileInputRef.current?.click()} type="button">
                  <Upload size={17} />
                  <span>Import CSV / JSON</span>
                </button>
                <button className="secondary-button" onClick={exportJsonBackup} type="button">
                  <Download size={17} />
                  <span>Export full JSON</span>
                </button>
                <div className="data-port-note">
                  <strong>CSV columns</strong>
                  <span>Record ID, Date, Month, Type, Amount INR, Category, Account and Notes.</span>
                </div>
              </div>
              <button className="secondary-button data-reset-button" onClick={resetDemoData} type="button">
                <RefreshCcw size={17} />
                <span>Restore demo data</span>
              </button>
              {isSupabaseAuthenticated && (
                <button className="secondary-button data-reset-button" onClick={signOutOfDatabase} type="button">
                  <LogOut size={17} />
                  <span>Sign out database</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                className="hidden-input"
                type="file"
                accept=".csv,text/csv,application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importDataFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </section>
          </section>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
      </div>
      {routeTransitionOverlay}
    </>
  );
}

function LegacyLandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="landing-shell">
      <div className="boot-layer" aria-hidden="true">
        <div className="boot-box">
          <h2>Booting...</h2>
          <p>Starting Money Map</p>
        </div>
      </div>

      <header className="landing-nav" aria-label="Landing navigation">
        <nav>
          <a href="#top">Home</a>
          <a href="#why">Why</a>
          <a href="#features">Features</a>
          <a href="#contact">Launch</a>
        </nav>
      </header>

      <main>
        <section className="landing-hero" id="top">
          <div className="scanline-layer" aria-hidden="true" />
          <div className="crt-glow" aria-hidden="true" />
          <div className="hero-copy">
            <p className="intro-line">Hi there, I’m</p>
            <h1>Money<br />Map</h1>
            <ul className="role-list" aria-label="Product roles">
              <li>Personal Finance Tracker</li>
              <li>Budget + Cash Flow Planner</li>
            </ul>
            <div className="landing-socials" aria-label="Product highlights">
              <span>₹</span>
              <span>Local</span>
              <span>Supabase-ready</span>
            </div>
          </div>

          <div className="retro-computer" aria-hidden="true">
            <div className="computer-head">
              <div className="computer-camera" />
              <div className="screen-frame">
                <div className="terminal-screen">
                  <div className="terminal-lines">
                    <span>money-map login: yuvi</span>
                    <span>password: ********</span>
                    <span>checking monthly budget...</span>
                    <span>income .......... ₹120,000</span>
                    <span>bills ........... ₹36,200</span>
                    <span>planned spend ... ₹78,000</span>
                    <span>leftover ........ ₹5,800</span>
                    <span className="terminal-ready">ready <b>█</b></span>
                  </div>
                </div>
              </div>
            </div>
            <div className="computer-neck" />
            <div className="computer-body">
              <div className="disk-slot" />
              <div className="drive-light" />
            </div>
            <div className="computer-keyboard">
              {Array.from({ length: 42 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>

          <a className="scroll-cue" href="#why">
            Scroll
            <ChevronDown size={18} />
          </a>
        </section>

        <section className="folio-section about-section" id="why">
          <h2>Hi there</h2>
          <p>
            Money Map is a local-first personal financial tracker designed for the quiet, practical work of
            knowing where your money is going.
          </p>
          <p>
            It brings together manual transactions, monthly category budgets, simple accounts, recurring
            income, recurring bills and a cash-flow forecast in one focused interface.
          </p>
          <p>
            The first version stores data in your browser for fast testing, while keeping the data model ready
            for a later Supabase database and authentication layer.
          </p>
        </section>

        <section className="folio-section project-section" id="features">
          <h2>Features</h2>

          <article className="folio-project">
            <hr />
            <div className="project-heading">
              <h3>Monthly Budgeting</h3>
              <span>V1</span>
            </div>
            <ul className="tag-list">
              <li>Categories</li>
              <li>INR</li>
              <li>Manual Entry</li>
              <li>Progress</li>
            </ul>
            <p>
              Set monthly limits for food, rent, transport, utilities, shopping and any custom categories you
              add. Spending updates the month instantly so the remaining budget is always visible.
            </p>
          </article>

          <article className="folio-project">
            <hr />
            <div className="project-heading">
              <h3>Cash Flow Forecast</h3>
              <span>2026</span>
            </div>
            <ul className="tag-list">
              <li>Recurring Income</li>
              <li>Bills</li>
              <li>Forecasting</li>
              <li>Runway</li>
            </ul>
            <p>
              Add simple monthly income and bills, then compare expected money in against fixed costs and
              budgeted spending to see projected leftover for the month.
            </p>
          </article>

          <article className="folio-project">
            <hr />
            <div className="project-heading">
              <h3>Local First Data</h3>
              <span>Private beta</span>
            </div>
            <ul className="tag-list">
              <li>Browser Storage</li>
              <li>JSON Backup</li>
              <li>TypeScript</li>
              <li>Supabase-ready</li>
            </ul>
            <p>
              Your test data stays in this browser and can be exported as CSV or a full JSON backup. The repository layer
              keeps the app ready for a future cloud database without changing the product flow.
            </p>
          </article>
        </section>

        <section className="folio-section contact-section" id="contact">
          <h2>Launch</h2>
          <p>Open the tracker and start mapping accounts, transactions, budgets and recurring bills.</p>
          <button className="launch-link" onClick={onEnter} type="button">
            <Sparkles size={20} />
            <span>Open tracker</span>
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <h2>Booting...</h2>
        <p>Starting...</p>
        <p>Designed for Money Map, based on the retro-computer layout and motion language of the reference site.</p>
        <p>COPYRIGHT © 2026 Money Map.</p>
      </footer>
    </div>
  );
}

function PageTransitionOverlay({ phase }: { phase: LandingTransitionPhase }) {
  return (
    <div className={`landing-page-transition ${phase}`} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} />
      ))}
      <strong>&gt; ROUTING_LEDGER...</strong>
    </div>
  );
}

function AuthPage({ onAuthenticated, onBack }: { onAuthenticated: (rememberSession?: boolean, email?: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [persistSession, setPersistSession] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [authState, setAuthState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [authMessage, setAuthMessage] = useState('AWAITING_CREDENTIALS...');
  const allowTestBypass = import.meta.env.MODE === 'test';

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !accessToken) {
      setAuthState('error');
      setAuthMessage('MISSING_FIELDS: USER_EMAIL + ACCESS_TOKEN REQUIRED');
      return;
    }

    setAuthState('pending');
    setAuthMessage(mode === 'login' ? 'AUTH_HANDSHAKE: VERIFYING_CREDENTIALS...' : 'REGISTRATION_PIPE: INITIALIZING_USER...');

    if (allowTestBypass) {
      setAuthState('success');
      setAuthMessage('TEST_SESSION_GRANTED');
      onAuthenticated(persistSession, trimmedEmail);
      return;
    }

    if (!supabase) {
      setAuthState('error');
      setAuthMessage('SUPABASE_ENV_MISSING: ADD VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY');
      return;
    }

    try {
      const credentials = { email: trimmedEmail, password: accessToken };
      const response =
        mode === 'login'
          ? await supabase.auth.signInWithPassword(credentials)
          : await supabase.auth.signUp(credentials);

      if (response.error) {
        setAuthState('error');
        setAuthMessage(response.error.message.toUpperCase());
        return;
      }

      if (response.data.session) {
        setAuthState('success');
        setAuthMessage(persistSession ? 'ACCESS_GRANTED: SESSION_PERSISTED' : 'ACCESS_GRANTED: SESSION_ACTIVE');
        window.setTimeout(() => onAuthenticated(persistSession, trimmedEmail), 260);
        return;
      }

      setAuthState('success');
      setAuthMessage('REGISTRATION_SENT: CHECK_EMAIL_CONFIRMATION');
    } catch {
      setAuthState('error');
      setAuthMessage('AUTH_PROCESS_FAILED: RETRY_CONNECTION');
    }
  };

  const toggleMode = () => {
    setMode((current) => (current === 'login' ? 'register' : 'login'));
    setAuthState('idle');
    setAuthMessage(mode === 'login' ? 'REGISTRATION_READY: ENTER_NEW_CREDENTIALS' : 'AWAITING_CREDENTIALS...');
  };

  const statusLabel =
    authState === 'pending'
      ? 'STATUS: HANDSHAKE_IN_PROGRESS...'
      : authState === 'success'
        ? 'STATUS: ACCESS_PACKET_ACCEPTED'
        : authState === 'error'
          ? 'STATUS: AUTH_BLOCKED'
          : 'STATUS: AWAITING_CREDENTIALS...';

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="Authentication">
        <header className="auth-titlebar">
          <div className="auth-title">
            <SquareTerminal size={24} />
            <span>FIN-TRACK_AUTH_v1.0</span>
          </div>
          <div className="auth-window-controls" aria-label="Window controls">
            <button onClick={onBack} type="button" aria-label="Return to landing page" />
            <span />
          </div>
        </header>

        <div className="auth-status-strip">
          <span>&gt; CONNECTION_SECURED: AES-256-GCM</span>
          <span>&gt; REMOTE_ADDR: 192.168.1.1</span>
          <span>&gt; {statusLabel}</span>
        </div>

        <form className="auth-body" onSubmit={submitAuth}>
          <div className="auth-copy">
            <h1>&gt; {mode === 'login' ? 'SYSTEM_LOGIN' : 'SYSTEM_REGISTER'}</h1>
            <p>// {mode === 'login' ? 'ENTER ENCRYPTED CREDENTIALS' : 'INITIALIZE SECURE PROFILE'}</p>
          </div>

          <label className="auth-field">
            <span>USER_EMAIL</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="root@fintrack.io"
              type="email"
              value={email}
            />
          </label>

          <label className="auth-field">
            <span>ACCESS_TOKEN</span>
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="............"
              type="password"
              value={accessToken}
            />
          </label>

          <label className="auth-checkbox">
            <input
              checked={persistSession}
              onChange={(event) => setPersistSession(event.target.checked)}
              type="checkbox"
            />
            <span>PERSIST_SESSION</span>
          </label>

          <button className="auth-submit" disabled={authState === 'pending'} type="submit">
            {authState === 'pending'
              ? 'EXECUTING...'
              : mode === 'login'
                ? 'EXECUTE_LOGIN ->'
                : 'EXECUTE_REGISTER ->'}
          </button>

          <p className={`auth-message ${authState}`} role="status" aria-live="polite">
            &gt; {authMessage}
          </p>

          <div className="auth-register-panel">
            <strong>{mode === 'login' ? 'NEW_USER_DETECTED?' : 'EXISTING_USER?'}</strong>
            <button onClick={toggleMode} type="button">
              {mode === 'login' ? '[ INITIALIZE_REGISTRATION ]' : '[ RETURN_TO_LOGIN ]'}
            </button>
          </div>
        </form>

        <footer className="auth-footer">
          <span>DB_STATE: READ_WRITE</span>
          <span>NODE: ASIA_SOUTH_1</span>
          <span>VER: 1.0.4-STABLE</span>
        </footer>
      </section>
    </main>
  );
}

function LandingPage({
  data,
  monthLabel,
  onEnter,
  onBootSeen,
  showBoot,
  summary
}: {
  data: FinanceData;
  monthLabel: string;
  onEnter: () => void;
  onBootSeen: () => void;
  showBoot: boolean;
  summary: MonthlySummary;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [heroFade, setHeroFade] = useState(1);
  const [loadingProgress, setLoadingProgress] = useState(showBoot ? 0 : 1);
  const [loadingItem, setLoadingItem] = useState(showBoot ? 'Starting...' : 'Ready.');
  const [loadingDone, setLoadingDone] = useState(!showBoot);
  const [transitionPhase, setTransitionPhase] = useState<LandingTransitionPhase>('idle');
  const [manualDetailsOpen, setManualDetailsOpen] = useState(false);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalLines, setTerminalLines] = useState<string[]>([
    'money-map login: local_guest',
    'type "help" for commands'
  ]);
  const terminalRef = useRef<HTMLDivElement>(null);
  const transitionTimeoutsRef = useRef<number[]>([]);
  const loadingItems = useMemo(
    () => [
      'Starting...',
      'Mounting local budget ledger...',
      'Checking INR formatting...',
      'Loading cash-flow shell...',
      'Preparing recurring bills...',
      'Ready.'
    ],
    []
  );

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const fadeStart = window.innerHeight * 0.06;
      const fadeDistance = window.innerHeight * 1.05;
      const progress = Math.min(1, Math.max(0, (scrollY - fadeStart) / fadeDistance));
      const eased = progress * progress * (3 - 2 * progress);
      const nextFade = 1 - eased;
      setHasScrolled(scrollY > 32);
      setHeroFade(nextFade);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!showBoot) {
      setLoadingProgress(1);
      setLoadingItem('Ready.');
      setLoadingDone(true);
      return;
    }

    setLoadingProgress(0);
    setLoadingItem('Starting...');
    setLoadingDone(false);
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setLoadingProgress(Math.min(1, step / (loadingItems.length - 1)));
      setLoadingItem(loadingItems[Math.min(step, loadingItems.length - 1)]);
      if (step >= loadingItems.length - 1) {
        window.clearInterval(timer);
        window.setTimeout(() => {
          setLoadingDone(true);
          onBootSeen();
        }, 360);
      }
    }, 360);
    return () => window.clearInterval(timer);
  }, [loadingItems, onBootSeen, showBoot]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.scrollTop = terminal.scrollHeight;
  }, [terminalLines, terminalInput]);

  useEffect(() => {
    return () => {
      transitionTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, []);

  const scheduleTransitionStep = (callback: () => void, delay: number) => {
    const timeout = window.setTimeout(() => {
      transitionTimeoutsRef.current = transitionTimeoutsRef.current.filter((current) => current !== timeout);
      callback();
    }, delay);
    transitionTimeoutsRef.current.push(timeout);
  };

  const showLandingSectionWithTransition = (sectionId: string) => {
    if (transitionPhase !== 'idle') return;

    setTransitionPhase('leaving');
    scheduleTransitionStep(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: 'start', behavior: 'auto' });
      setTransitionPhase('leaving-down');
      scheduleTransitionStep(() => setTransitionPhase('idle'), LANDING_TRANSITION_RETURN_MS);
    }, LANDING_TRANSITION_EXIT_MS);
  };

  const closeMenu = () => setMenuOpen(false);
  const openTrackerWithTransition = onEnter;
  const terminalTopCategory = summary.topSpending[0];
  const terminalPrimaryAccount = summary.accountBalances[0];

  const runTerminalCommand = (rawCommand: string) => {
    const command = rawCommand.trim().toLowerCase();
    if (!command) return;

    if (command === 'clear') {
      setTerminalLines(['money-map login: local_guest', 'type "help" for commands']);
      return;
    }

    if (command === 'open' || command === 'app') {
      setTerminalLines((current) => [...current, `> ${rawCommand}`, 'opening tracker...']);
      openTrackerWithTransition();
      return;
    }

    const responses: Record<string, { lines: string[]; action?: () => void }> = {
      help: {
        lines: [
          '> help',
          'commands: budget, cashflow, accounts, tx, backup, about, open, clear',
          'budget/about also move the page while the bars cover the screen'
        ]
      },
      budget: {
        lines: [
          '> budget',
          `${monthLabel}: ${formatMoney(summary.budgetSpent)} spent`,
          `${formatMoney(summary.budgetRemaining)} budget remaining`,
          terminalTopCategory
            ? `top category: ${terminalTopCategory.category.name} ${formatMoney(terminalTopCategory.amount)}`
            : 'top category: no spending yet'
        ],
        action: () => showLandingSectionWithTransition('projects')
      },
      cashflow: {
        lines: [
          '> cashflow',
          `expected income: ${formatMoney(summary.expectedIncome)}`,
          `fixed bills: ${formatMoney(summary.expectedBills)}`,
          `projected leftover: ${formatMoney(summary.projectedLeftover)}`
        ],
        action: () => showLandingSectionWithTransition('projects')
      },
      accounts: {
        lines: [
          '> accounts',
          `${data.accounts.filter((account) => !account.archived).length} active accounts`,
          terminalPrimaryAccount
            ? `${terminalPrimaryAccount.account.name}: ${formatMoney(terminalPrimaryAccount.balance)}`
            : 'no account balances yet',
          'open the app to edit balances'
        ]
      },
      tx: {
        lines: [
          '> tx',
          `${data.transactions.length} transactions stored`,
          `${data.categories.length} categories configured`,
          'manual entry keeps the month intentional'
        ]
      },
      backup: {
        lines: ['> backup', 'ledger csv + full json available in settings', 'authenticated sessions sync to database']
      },
      about: {
        lines: ['> about', 'local-first INR tracker', 'budgets, cash flow, accounts, recurring bills'],
        action: () => showLandingSectionWithTransition('aboutMe')
      }
    };
    const response = responses[command];

    setTerminalLines((current) => [
      ...current,
      ...(response?.lines ?? [`> ${rawCommand}`, `command not found: ${rawCommand}`, 'try: help'])
    ].slice(-40));
    response?.action?.();
  };

  const handleTerminalKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      runTerminalCommand(terminalInput);
      setTerminalInput('');
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      setTerminalInput((current) => current.slice(0, -1));
      return;
    }

    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      setTerminalInput((current) => `${current}${event.key}`.slice(0, 28));
    }
  };

  return (
    <div className="landing-shell" data-scroll={hasScrolled ? 'true' : 'false'}>
      <div id="home" />
      <div className="landing-bg-lines" aria-hidden="true" />
      <div
        className="landing-hero-stage"
        style={{
          opacity: heroFade,
          pointerEvents: heroFade > 0.08 ? 'auto' : 'none',
          transform: `translateY(${(1 - heroFade) * -36}px) scale(${1 - (1 - heroFade) * 0.025})`
        }}
      >
        <div id="hero-backup">
          <h3>Hi there, I’m</h3>
          <h1>Money Map</h1>
          <ul>
            <li>Personal Finance Tracker</li>
            <li>Budget + Cash Flow Planner</li>
          </ul>
          <p>
            A local-first INR tracker for budgets, recurring bills, accounts and monthly cash-flow clarity.
          </p>
        </div>

        <div className="hero-monitor" aria-label="Interactive retro monitor">
          <div className="hero-monitor-head">
            <div className="hero-monitor-bezel">
              <div
                className={terminalFocused ? 'landing-terminal focused' : 'landing-terminal'}
                onBlur={() => setTerminalFocused(false)}
                onClick={() => terminalRef.current?.focus()}
                onFocus={() => setTerminalFocused(true)}
                onKeyDown={handleTerminalKeyDown}
                ref={terminalRef}
                role="textbox"
                tabIndex={0}
                aria-label="Interactive Money Map terminal"
              >
                {terminalLines.map((line, index) => (
                  <span key={`${line}-${index}`}>{line}</span>
                ))}
                <span className="terminal-prompt">&gt; {terminalInput}<b>█</b></span>
              </div>
            </div>
          </div>
          <div className="hero-monitor-neck" />
          <div className="hero-monitor-drive">
            <span />
            <b />
          </div>
          <div className="hero-keyboard">
            {Array.from({ length: 39 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
        </div>
      </div>

      <nav className={menuOpen ? 'active' : ''}>
        <div className="menu-btn">
          <button
            className="btn"
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
            aria-label="Toggle menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect width="16" height="3.2" />
              <rect y="6.4" width="16" height="3.2" />
              <rect y="12.8" width="16" height="3.2" />
            </svg>
          </button>
          <div className="landing-social-buttons">
            <button
              className="btn"
              onClick={() => showLandingSectionWithTransition('projects')}
              type="button"
              aria-label="Show budget features"
              title="Budget features"
            >
              ₹
            </button>
            <button
              className="btn"
              onClick={() => showLandingSectionWithTransition('aboutMe')}
              type="button"
              aria-label="Show local-first information"
              title="Local-first overview"
            >
              LF
            </button>
            <button className="btn" onClick={openTrackerWithTransition} type="button" aria-label="Open tracker" title="Sign in">
              App
            </button>
          </div>
        </div>

        <div className="menu-body" onClick={closeMenu}>
          <a href="#home">Home</a>
          <a href="#aboutMe">About</a>
          <a href="#projects">Projects</a>
          <a href="#contact">Contact</a>
        </div>

        <div id="tip-scroll">Scroll ↓</div>
      </nav>

      <main className="landing-main">
        <section>
          <h1 id="aboutMe">Hi there</h1>
          <p>
            Money Map is a local-first personal financial tracker for monthly budgets, cash-flow
            forecasting and simple account balances. It is built for the practical work of knowing
            what came in, what went out and what is still safe to spend.
          </p>
          <p>
            The first version focuses on manual entry, INR formatting, recurring income, recurring
            bills, category budgets and CSV/JSON export/import.
          </p>
          <p>
            The app stores test data in this browser today, while keeping the data model and
            repository layer ready for Supabase when it is time to deploy with auth and a database.
          </p>
          <div className="landing-command-strip" aria-label="Money Map quick benefits">
            <span>&gt; INR_DEFAULT</span>
            <span>&gt; LOCAL_BACKUP</span>
            <span>&gt; MONTHLY_BUDGETS</span>
          </div>
        </section>

        <section>
          <h1>How it works</h1>
          <p>
            Money Map is intentionally manual-first: you enter the important transactions yourself,
            then the app turns them into a monthly control panel instead of a messy spreadsheet.
          </p>
          <div className="landing-info-grid">
            <article>
              <h2>01 Accounts</h2>
              <p>Start with cash, bank and card accounts so every transaction has a home.</p>
            </article>
            <article>
              <h2>02 Transactions</h2>
              <p>Log income and expenses with category, account, date and notes.</p>
            </article>
            <article>
              <h2>03 Budgets</h2>
              <p>Set monthly limits and watch remaining budget update as spending changes.</p>
            </article>
            <article>
              <h2>04 Forecast</h2>
              <p>Recurring income and bills estimate what is left before the month ends.</p>
            </article>
          </div>
          <div className="landing-workflow-panel">
            <h2>Better daily flow</h2>
            <ol>
              <li><span>01</span><p>Open the app, add the transaction, and move on.</p></li>
              <li><span>02</span><p>Check budget pressure before the month gets noisy.</p></li>
              <li><span>03</span><p>Use recurring income and bills to see leftover cash early.</p></li>
            </ol>
          </div>
        </section>

        <section>
          <h1 id="projects">Projects</h1>
          <hr />
          <h2>Budget Dashboard</h2>
          <h3>V1</h3>
          <ul className="skills">
            <li>React</li>
            <li>TypeScript</li>
            <li>INR</li>
            <li>Local Storage</li>
            <li>Budgeting</li>
          </ul>
          <p>
            The dashboard shows monthly income, expenses, budget remaining, projected leftover,
            category progress and account balances in one compact view.
          </p>
          <div className="image">
            <div className="mock-window" aria-label="Budget dashboard preview">
              <div className="mock-title">money-map://dashboard</div>
              <div className="mock-grid">
                <span>Income<br /><b>₹120,000</b></span>
                <span>Expenses<br /><b>₹40,100</b></span>
                <span>Budget Left<br /><b>₹37,900</b></span>
                <span>Forecast<br /><b>₹5,800</b></span>
              </div>
              <div className="mock-bars">
                <i style={{ width: '78%' }} />
                <i style={{ width: '48%' }} />
                <i style={{ width: '62%' }} />
              </div>
            </div>
          </div>
          <hr />
          <h2>Cash Flow Forecast</h2>
          <h3>2026</h3>
          <ul className="skills">
            <li>Recurring Income</li>
            <li>Bills</li>
            <li>Forecasting</li>
            <li>Runway</li>
          </ul>
          <p>
            Recurring salary and recurring bills feed a simple monthly forecast, so the app can
            compare expected money in against fixed costs and planned spending.
          </p>
          <hr />
          <h2>Manual Transactions</h2>
          <h3>Local-first</h3>
          <ul className="skills">
            <li>Manual Entry</li>
            <li>Accounts</li>
            <li>Categories</li>
            <li>Backup</li>
          </ul>
          <p>
            Add income and expenses by hand, assign them to accounts and categories, then export
            a polished CSV ledger or import records whenever you need to move data.
          </p>
          <button
            className="collapse-btn btn"
            data-collapsed={manualDetailsOpen ? 'false' : 'true'}
            aria-expanded={manualDetailsOpen}
            aria-controls="manual-details"
            onClick={() => setManualDetailsOpen((current) => !current)}
            type="button"
          >
            {manualDetailsOpen ? 'less...' : 'more...'}
          </button>
          <div className="collapse-body" id="manual-details">
            <p>
              The repository interface is intentionally separate from the UI, which makes the future
              Supabase phase a storage swap rather than a product rewrite.
            </p>
          </div>
        </section>

        <section>
          <h1 id="contact">Contact</h1>
          <p style={{ textAlign: 'center' }}>Ready to use it?</p>
          <div className="landing-final-checks" aria-label="Ready checklist">
            <span>AUTH_GATE_READY</span>
            <span>LOCAL_DATA_SAFE</span>
            <span>EXPORT_AVAILABLE</span>
          </div>
          <button className="btn open-tracker-btn" onClick={openTrackerWithTransition} type="button">
            Sign in
          </button>
        </section>
      </main>

      <div id="loading" className={loadingDone ? 'loaded' : ''}>
        <h2>Booting...</h2>
        <div id="loading-bar">
          <div id="loading-bar-progress" style={{ transform: `scaleX(${loadingProgress})` }} />
        </div>
        <div id="loading-items">{loadingItem}</div>
      </div>

      <PageTransitionOverlay phase={transitionPhase} />

      <footer>
        <div>Developed by Yuvan Reddy Vadde</div>
        <div>Computer design based on a retro personal finance terminal.</div>
        <div>COPYRIGHT © 2026 Money Map.</div>
      </footer>
    </div>
  );
}

function RetroCanvas({ fade }: { fade: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, active: false });

  useEffect(() => {
    if (window.navigator.userAgent.includes('jsdom')) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let frame = 0;
    let animationId = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
      context.beginPath();
      context.moveTo(x + radius, y);
      context.arcTo(x + width, y, x + width, y + height, radius);
      context.arcTo(x + width, y + height, x, y + height, radius);
      context.arcTo(x, y + height, x, y, radius);
      context.arcTo(x, y, x + width, y, radius);
      context.closePath();
    };

    const drawComputer = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pointer = pointerRef.current;
      const time = frame / 60;
      const parallaxX = pointer.active ? pointer.x * 22 : Math.sin(time * 0.7) * 8;
      const parallaxY = pointer.active ? pointer.y * 16 : Math.cos(time * 0.8) * 6;
      const scale = Math.min(1.06, Math.max(0.62, width / 1120));
      const cx = width * 0.64 + parallaxX;
      const cy = height * 0.48 + parallaxY;
      const unit = 430 * scale;

      context.clearRect(0, 0, width, height);
      context.fillStyle = '#f6d4b1';
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = 0.13;
      context.strokeStyle = '#525252';
      for (let y = 0; y < height; y += 7) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.restore();

      context.save();
      context.translate(cx, cy);
      context.rotate((-0.06 + pointer.x * 0.04) * Math.PI);

      context.fillStyle = 'rgba(82, 82, 82, 0.22)';
      roundedRect(-unit * 0.44 + 24, unit * 0.46, unit * 0.88, unit * 0.12, 8);
      context.fill();

      context.fillStyle = '#d7c49d';
      context.strokeStyle = '#525252';
      context.lineWidth = 5;
      roundedRect(-unit * 0.5, -unit * 0.46, unit, unit * 0.78, 10);
      context.fill();
      context.stroke();

      context.fillStyle = '#525252';
      roundedRect(-unit * 0.36, -unit * 0.34, unit * 0.72, unit * 0.46, 8);
      context.fill();

      context.fillStyle = '#112f24';
      roundedRect(-unit * 0.3, -unit * 0.28, unit * 0.6, unit * 0.34, 6);
      context.fill();

      context.save();
      context.globalAlpha = 0.26;
      context.strokeStyle = '#99f6b7';
      context.lineWidth = 1;
      for (let y = -unit * 0.25; y < unit * 0.04; y += 18 * scale) {
        context.beginPath();
        context.moveTo(-unit * 0.27, y);
        context.lineTo(unit * 0.27, y);
        context.stroke();
      }
      context.restore();

      context.fillStyle = '#b7a987';
      roundedRect(-unit * 0.38, unit * 0.33, unit * 0.76, unit * 0.16, 8);
      context.fill();
      context.stroke();

      context.fillStyle = '#525252';
      roundedRect(-unit * 0.28, unit * 0.38, unit * 0.26, unit * 0.025, 4);
      context.fill();
      context.fillStyle = Math.floor(time * 2) % 2 ? '#22c55e' : '#315f3e';
      context.beginPath();
      context.arc(unit * 0.25, unit * 0.395, 6 * scale, 0, Math.PI * 2);
      context.fill();

      context.translate(0, unit * 0.62);
      context.fillStyle = '#b7a987';
      roundedRect(-unit * 0.54, -unit * 0.06, unit * 1.08, unit * 0.18, 8);
      context.fill();
      context.stroke();

      context.fillStyle = '#525252';
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 13; col += 1) {
          roundedRect(-unit * 0.47 + col * unit * 0.075, -unit * 0.02 + row * unit * 0.046, unit * 0.045, unit * 0.022, 2);
          context.fill();
        }
      }

      context.restore();
    };

    const animate = () => {
      frame += 1;
      drawComputer();
      animationId = window.requestAnimationFrame(animate);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = {
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
        active: true
      };
    };

    const handlePointerLeave = () => {
      pointerRef.current.active = false;
    };

    resize();
    animate();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return <canvas className="webgl" ref={canvasRef} style={{ opacity: fade }} />;
}

function MetricCard({
  label,
  value,
  detail,
  badge,
  tone,
  icon: Icon
}: {
  label: string;
  value: string;
  detail?: string;
  badge?: string;
  tone: 'green' | 'rose' | 'amber' | 'blue';
  icon: typeof ArrowUpCircle;
}) {
  return (
    <section className={`metric-card ${tone}`}>
      <div className="metric-head">
        <span className="metric-title">
          <Icon size={19} />
          {label}
        </span>
        {badge && <b>{badge}</b>}
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </section>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Color">
      {colorOptions.map((color) => (
        <button
          key={color}
          aria-label={color}
          aria-checked={value === color}
          className={value === color ? 'swatch selected' : 'swatch'}
          onClick={() => onChange(color)}
          role="radio"
          style={{ background: color }}
          type="button"
        />
      ))}
    </div>
  );
}

function TerminalMonthPicker({
  month,
  open,
  onChange,
  onToggle
}: {
  month: string;
  open: boolean;
  onChange: (month: string) => void;
  onToggle: () => void;
}) {
  const [yearText, monthText] = month.split('-');
  const selectedYear = Number(yearText);
  const selectedMonthIndex = Number(monthText) - 1;
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const setYear = (nextYear: number) => {
    onChange(`${nextYear}-${monthText}`);
  };
  const setCurrentMonth = () => onChange(getMonthKey());

  return (
    <div className="month-control terminal-month-picker">
      <span>MONTH</span>
      <button className="month-trigger" onClick={onToggle} type="button" aria-expanded={open}>
        {getMonthLabel(month)}
      </button>
      {open && (
        <div className="month-popover" role="dialog" aria-label="Select month">
          <div className="month-popover-head">
            <button onClick={() => setYear(selectedYear - 1)} type="button" aria-label="Previous year">◀</button>
            <strong>{selectedYear}</strong>
            <button onClick={() => setYear(selectedYear + 1)} type="button" aria-label="Next year">▶</button>
          </div>
          <div className="month-grid">
            {monthNames.map((name, index) => {
              const nextMonth = `${selectedYear}-${String(index + 1).padStart(2, '0')}`;
              return (
                <button
                  className={index === selectedMonthIndex ? 'selected' : ''}
                  key={name}
                  onClick={() => onChange(nextMonth)}
                  type="button"
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="month-popover-foot">
            <button onClick={() => onChange(`${selectedYear}-01`)} type="button">CLEAR</button>
            <button onClick={setCurrentMonth} type="button">THIS_MONTH</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
