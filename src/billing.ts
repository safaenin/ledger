export const cadences = ['Weekly', 'Monthly', 'Quarterly', 'Yearly', 'One-time', 'Custom'] as const;
export type Cadence = typeof cadences[number];
export type Bill = {
  id: string; number: string; description: string; cadence: Cadence;
  periodStart: string; periodEnd: string; issuedOn: string; dueOn: string;
  amountPaise: number; paidPaise: number; currency: 'INR';
  lastPaymentId: string; createdAt: string; updatedAt: string;
};
export const paymentMethods = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Other'] as const;
export type Payment = { id: string; amountPaise: number; paidOn: string; method: typeof paymentMethods[number]; reference: string; createdAt: string };
export const MAX_AMOUNT_PAISE = 100_000_000_000;
export function parseAmount(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a positive amount with up to two decimal places.');
  const [rupees, paise = ''] = value.trim().split('.');
  const amount = Number(rupees) * 100 + Number(paise.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT_PAISE) throw new Error('Amount must be between ₹0.01 and ₹1,00,00,00,000.');
  return amount;
}
export const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(paise / 100);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function periodEnd(start: string, cadence: Cadence): string {
  if (!isDate(start)) return start;
  const date = new Date(`${start}T00:00:00Z`);
  if (cadence === 'Weekly') date.setUTCDate(date.getUTCDate() + 6);
  else if (['Monthly', 'Quarterly', 'Yearly'].includes(cadence)) {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + (cadence === 'Monthly' ? 1 : cadence === 'Quarterly' ? 3 : 12));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}
export const dateLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
export const billStatus = (bill: Pick<Bill, 'paidPaise' | 'amountPaise'>) => bill.paidPaise >= bill.amountPaise ? 'Paid' : bill.paidPaise > 0 ? 'Part paid' : 'Unpaid';
export const isOverdue = (bill: Pick<Bill, 'paidPaise' | 'amountPaise' | 'dueOn'>, date = today()) => bill.paidPaise < bill.amountPaise && bill.dueOn < date;
export function summarize(bills: Bill[]) {
  return bills.reduce((total, bill) => ({ count: total.count + 1, billed: total.billed + bill.amountPaise, paid: total.paid + bill.paidPaise, outstanding: total.outstanding + bill.amountPaise - bill.paidPaise }), { count: 0, billed: 0, paid: 0, outstanding: 0 });
}
export function validateBill(bill: Bill) {
  if (!bill.description.trim() || bill.description.length > 200) throw new Error('Enter a bill description (up to 200 characters).');
  if (!cadences.includes(bill.cadence)) throw new Error('Choose a billing frequency.');
  if (![bill.periodStart, bill.periodEnd, bill.issuedOn, bill.dueOn].every(isDate)) throw new Error('Enter valid billing dates.');
  if (bill.periodEnd < bill.periodStart) throw new Error('The billing period must end on or after its start.');
  if (bill.issuedOn > today()) throw new Error('Issue date cannot be in the future.');
  if (bill.dueOn < bill.issuedOn) throw new Error('The due date must be on or after the issue date.');
  if (!Number.isSafeInteger(bill.amountPaise) || bill.amountPaise <= 0 || bill.amountPaise > MAX_AMOUNT_PAISE) throw new Error('Enter a valid bill amount.');
}
export function validatePayment(payment: Payment, bill: Bill) {
  if (!Number.isSafeInteger(payment.amountPaise) || payment.amountPaise <= 0 || payment.amountPaise > bill.amountPaise - bill.paidPaise) throw new Error('Payment must be greater than zero and cannot exceed the remaining balance.');
  if (!isDate(payment.paidOn) || payment.paidOn < bill.issuedOn || payment.paidOn > today()) throw new Error('Payment date must be between the issue date and today.');
  if (!paymentMethods.includes(payment.method) || payment.reference.length > 200) throw new Error('Check the payment method and reference.');
}
