import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billStatus, isOverdue, parseAmount, periodEnd, summarize, validateBill, validatePayment, type Bill, type Payment } from './billing.ts';
const bill: Bill = { id: 'bill-one', number: 'BILL-ONE', description: 'Monthly bookkeeping', cadence: 'Monthly', periodStart: '2026-01-01', periodEnd: '2026-01-31', issuedOn: '2026-02-01', dueOn: '2026-02-10', amountPaise: 10001, paidPaise: 0, currency: 'INR', lastPaymentId: '', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' };
test('amount parsing preserves paise and rejects invalid or unsafe money', () => {
  assert.equal(parseAmount('100.01'), 10001); assert.equal(parseAmount('0.10'), 10); assert.equal(parseAmount('1.9'), 190);
  for (const value of ['0', '-1', 'NaN', '1.001', '1e3', '9999999999999999999', '₹100', '']) assert.throws(() => parseAmount(value));
});
test('per-merchant summary counts bills, paid and remaining balances exactly', () => {
  const bills = [bill, { ...bill, id: 'two', amountPaise: 20000, paidPaise: 5000 }, { ...bill, id: 'three', amountPaise: 500, paidPaise: 500 }];
  assert.deepEqual(summarize(bills), { count: 3, billed: 30501, paid: 5500, outstanding: 25001 });
  assert.deepEqual(summarize([]), { count: 0, billed: 0, paid: 0, outstanding: 0 });
  assert.equal(billStatus(bills[0]), 'Unpaid'); assert.equal(billStatus(bills[1]), 'Part paid'); assert.equal(billStatus(bills[2]), 'Paid');
});
test('overdue uses remaining balance and excludes the due date itself', () => {
  assert.equal(isOverdue(bill, '2026-02-10'), false); assert.equal(isOverdue(bill, '2026-02-11'), true);
  assert.equal(isOverdue({ ...bill, paidPaise: bill.amountPaise }, '2026-02-11'), false);
});
test('billing periods handle week, month, quarter, year and leap boundaries', () => {
  assert.equal(periodEnd('2026-12-28', 'Weekly'), '2027-01-03');
  assert.equal(periodEnd('2026-01-01', 'Monthly'), '2026-01-31');
  assert.equal(periodEnd('2024-02-01', 'Monthly'), '2024-02-29');
  assert.equal(periodEnd('2026-10-01', 'Quarterly'), '2026-12-31');
  assert.equal(periodEnd('2026-01-01', 'Yearly'), '2026-12-31');
  assert.equal(periodEnd('2026-01-31', 'Monthly'), '2026-02-27');
});
test('bill and payment validation rejects bad dates and overpayments', () => {
  assert.doesNotThrow(() => validateBill(bill));
  for (const change of [{ dueOn: '2026-01-01' }, { periodEnd: '2025-12-31' }, { issuedOn: '2026-02-30' }, { amountPaise: 1.5 }, { description: ' ' }]) assert.throws(() => validateBill({ ...bill, ...change }));
  const payment: Payment = { id: 'payment-one', amountPaise: 1, paidOn: bill.issuedOn, method: 'Cash', reference: '', createdAt: bill.createdAt };
  assert.doesNotThrow(() => validatePayment(payment, bill));
  for (const change of [{ amountPaise: 0 }, { amountPaise: 10002 }, { paidOn: '2026-01-31' }, { paidOn: '2099-01-01' }]) assert.throws(() => validatePayment({ ...payment, ...change }, bill));
});
