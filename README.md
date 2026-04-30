# 💰 Money Map

<div align="center">

**Local-first personal finance tracker with Supabase authentication**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-cyan)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.3-purple)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3.x-green)](https://supabase.com/)

*A modern, privacy-focused financial tracker that keeps your data in your browser while providing secure authentication via Supabase.*

</div>

---

## ✨ Features

- 🏠 **Local-first Architecture** - Your financial data stays in your browser by default
- 🔐 **Supabase Authentication** - Secure login/signup with optional cloud sync
- 📊 **Dashboard** - Visual overview of your financial health
- 💳 **Account Management** - Track multiple accounts (Cash, Bank, Card)
- 📋 **Category Organization** - Custom income/expense categories with color coding
- 📝 **Transaction Tracking** - Add, edit, and delete transactions
- 💰 **Budget Planning** - Set monthly budgets per category
- 🔄 **Recurring Items** - Track recurring income and bills
- 📈 **Cash Flow Analysis** - Visualize income vs expenses over time
- 🎨 **Modern UI** - Retro terminal-inspired design with smooth animations
- 🌙 **Dark Mode** - Easy on the eyes
- 📦 **JSON Export** - Backup your data anytime

---

## 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI Framework |
| **TypeScript 5.6** | Type Safety |
| **Vite 7.3** | Build Tool & Dev Server |
| **Supabase** | Authentication & Database |
| **Lucide React** | Icons |
| **CSS** | Styling (No framework dependency) |
| **Vitest** | Testing |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (for authentication features)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/qwyuvanyt6-sketch/personal-finance-tracker.git
cd personal-finance-tracker
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env.local` file in the root directory:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> **Note:** You can get these values from your Supabase project settings. If you don't have Supabase configured, the app will run in local-only mode.

4. **Run the development server**
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the app.

---

## 🗄 Supabase Setup

### Database Schema

The app uses the following tables in Supabase:

- **`accounts`** - User accounts (cash, bank, card)
- **`categories`** - Income/expense categories
- **`transactions`** - Financial transactions
- **`budgets`** - Monthly budget limits
- **`recurring_items`** - Recurring income/bills

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.

### Setting up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase.md` or use the SQL below:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'card')),
  opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6366f1',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  color TEXT NOT NULL DEFAULT '#6366f1',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount DECIMAL(12,2) NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  limit_amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month, category_id)
);

-- Recurring items table
CREATE TABLE IF NOT EXISTS recurring_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'bill')),
  amount DECIMAL(12,2) NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can only access their own accounts" ON accounts
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can only access their own categories" ON categories
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can only access their own transactions" ON transactions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can only access their own budgets" ON budgets
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can only access their own recurring items" ON recurring_items
  FOR ALL USING (user_id = auth.uid());
```

---

## 📁 Project Structure

```
personal-finance-tracker/
├── src/
│   ├── data/
│   │   ├── localStorageRepository.ts    # Local storage implementation
│   │   ├── supabaseClient.ts           # Supabase client configuration
│   │   ├── supabaseRepository.ts       # Supabase repository implementation
│   │   ├── seedData.ts                 # Default seed data
│   │   └── repository.ts               # Repository interface
│   ├── domain/
│   │   ├── calculations.ts             # Financial calculations
│   │   ├── dates.ts                    # Date utilities
│   │   ├── format.ts                   # Formatting utilities
│   │   └── types.ts                    # TypeScript type definitions
│   ├── App.tsx                         # Main application component
│   ├── App.test.tsx                    # Application tests
│   ├── main.tsx                        # Application entry point
│   └── styles.css                      # Global styles
├── .env.local                          # Environment variables (gitignored)
├── .env.example                        # Environment variables template
├── package.json                        # Dependencies
├── tsconfig.json                       # TypeScript configuration
└── vite.config.ts                      # Vite configuration
```

---

## 🧪 Testing

Run the test suite:

```bash
npm test
```

---

## 📦 Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

---

## 🌐 Deployment

### Vercel

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

### Other Platforms

The app can be deployed to any static hosting service (Netlify, GitHub Pages, etc.) since it's a pure client-side application.

---

## 🔒 Privacy & Security

- **Local Storage**: By default, all data is stored in your browser's local storage
- **Supabase RLS**: Row Level Security ensures users can only access their own data
- **No Tracking**: No analytics or tracking scripts
- **Open Source**: Fully transparent, you can audit the code

---

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

<div align="center">

**Built with ❤️ for personal finance management**

</div>
