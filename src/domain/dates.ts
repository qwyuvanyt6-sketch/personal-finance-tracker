export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const getMonthKey = (dateLike: string | Date = new Date()) => {
  const date = typeof dateLike === 'string' ? new Date(`${dateLike}T00:00:00`) : dateLike;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
};

export const getMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, 1));
};

export const isDateInMonth = (date: string, monthKey: string) => date.startsWith(monthKey);
