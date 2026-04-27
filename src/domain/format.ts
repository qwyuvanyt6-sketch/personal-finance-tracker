export const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);

export const formatSignedMoney = (amount: number) => {
  const prefix = amount > 0 ? '+' : '';
  return `${prefix}${formatMoney(amount)}`;
};
