import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { createBill, deleteUnbilledMerchant, recordPayment } from '../src/billingStore.ts';
import { summarize, type Bill, type Payment } from '../src/billing.ts';
let env: RulesTestEnvironment;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-ledger-billing', firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env?.cleanup(); });
const database = (uid = 'owner') => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const merchant = (id: string) => ({ id, name: 'Test merchant', gstin: '', loginId: 'test-id', email: '', phone: '', category: 'Services', notes: '', updatedAt: '2026-01-01T00:00:00Z' });
const bill = (id = 'bill-one', amountPaise = 10000): Bill => ({ id, number: `BILL-${id}`, description: 'Services', cadence: 'Monthly', periodStart: '2026-01-01', periodEnd: '2026-01-31', issuedOn: '2026-01-01', dueOn: '2026-02-01', amountPaise, paidPaise: 0, currency: 'INR', lastPaymentId: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
const payment = (id: string, amountPaise: number): Payment => ({ id, amountPaise, paidOn: '2026-01-02', method: 'UPI', reference: 'test receipt', createdAt: '2026-01-02T00:00:00Z' });
const merchantRef = (db: Firestore, id = 'merchant-one') => doc(db, 'users', 'owner', 'merchants', id);
const billRef = (db: Firestore, id = 'bill-one', merchantId = 'merchant-one') => doc(merchantRef(db, merchantId), 'bills', id);
async function setup() { const db = database(); await setDoc(merchantRef(db), merchant('merchant-one')); await createBill(db, 'owner', 'merchant-one', bill()); return db; }
test('bill creation, partial payment, full payment and reload keep exact totals', async () => {
 const db = await setup();
 await recordPayment(db, 'owner', 'merchant-one', 'bill-one', payment('first', 4000));
 assert.equal((await getDoc(billRef(db))).data()?.paidPaise, 4000);
 await recordPayment(db, 'owner', 'merchant-one', 'bill-one', payment('second', 6000));
 const fresh = database();
 const reloaded = (await getDocs(collection(merchantRef(fresh), 'bills'))).docs.map(d => d.data() as Bill);
 assert.deepEqual(summarize(reloaded), { count: 1, billed: 10000, paid: 10000, outstanding: 0 });
 assert.equal((await getDocs(collection(billRef(fresh), 'payments'))).size, 2);
});
test('retried bill/payment submissions are idempotent', async () => {
 const db = database(); await setDoc(merchantRef(db), merchant('merchant-one'));
 await Promise.all([createBill(db, 'owner', 'merchant-one', bill()), createBill(db, 'owner', 'merchant-one', bill())]);
 await assert.rejects(createBill(db, 'owner', 'merchant-one', bill('bill-one', 20000)));
 await Promise.all([recordPayment(db, 'owner', 'merchant-one', 'bill-one', payment('same', 1000)), recordPayment(db, 'owner', 'merchant-one', 'bill-one', payment('same', 1000))]);
 assert.equal((await getDoc(billRef(db))).data()?.paidPaise, 1000);
 assert.equal((await getDocs(collection(billRef(db), 'payments'))).size, 1);
 await assert.rejects(recordPayment(db, 'owner', 'merchant-one', 'bill-one', payment('same', 2000)));
});
test('concurrent receipts cannot overpay a bill', async () => {
 const db = await setup();
 const results = await Promise.allSettled([recordPayment(db, 'owner', 'merchant-one', 'bill-one', payment('one', 7000)), recordPayment(db, 'owner', 'merchant-one', 'bill-one', payment('two', 7000))]);
 assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
 assert.equal((await getDoc(billRef(db))).data()?.paidPaise, 7000);
 assert.equal((await getDocs(collection(billRef(db), 'payments'))).size, 1);
});
test('accounts cannot access another account’s bills or payments', async () => {
 await setup(); const other = database('other'); const anonymous = env.unauthenticatedContext().firestore() as unknown as Firestore;
 for (const db of [other, anonymous]) {
  await assertFails(getDoc(billRef(db)));
  await assertFails(getDocs(collection(merchantRef(db), 'bills')));
  await assertFails(getDocs(collection(billRef(db), 'payments')));
  await assertFails(setDoc(doc(billRef(db), 'payments', 'attack'), payment('attack', 1)));
 }
});
test('rules enforce atomic receipts, immutable bills and no overpayments', async () => {
 const db = await setup(); const ref = billRef(db);
 await assertFails(updateDoc(ref, { paidPaise: 1000, lastPaymentId: 'missing' }));
 await assertFails(setDoc(doc(ref, 'payments', 'unlinked'), payment('unlinked', 1000)));
 const batch = writeBatch(db);
 batch.set(doc(ref, 'payments', 'too-much'), payment('too-much', 10001));
 batch.update(ref, { paidPaise: 10001, lastPaymentId: 'too-much' });
 await assertFails(batch.commit());
 const mismatch = writeBatch(db);
 mismatch.set(doc(ref, 'payments', 'mismatch'), payment('mismatch', 1000));
 mismatch.update(ref, { paidPaise: 500, lastPaymentId: 'mismatch' });
 await assertFails(mismatch.commit());
 await assertFails(updateDoc(ref, { amountPaise: 20000 }));
 await assertFails(deleteDoc(ref));
 await recordPayment(db, 'owner', 'merchant-one', 'bill-one', payment('valid', 1000));
 await assertFails(updateDoc(doc(ref, 'payments', 'valid'), { amountPaise: 2000 }));
 await assertFails(deleteDoc(doc(ref, 'payments', 'valid')));
 await assertFails(updateDoc(ref, { paidPaise: 2000, lastPaymentId: 'valid' }));
});
test('billing history protects merchant deletion and merchants remain independent', async () => {
 const db = await setup();
 await assert.rejects(deleteUnbilledMerchant(db, 'owner', 'merchant-one'), /billing history/);
 await assertFails(deleteDoc(merchantRef(db)));
 await assertFails(updateDoc(merchantRef(db), { billingStarted: false }));
 await setDoc(merchantRef(db, 'merchant-two'), merchant('merchant-two'));
 await createBill(db, 'owner', 'merchant-two', bill('bill-two', 2500));
 await recordPayment(db, 'owner', 'merchant-two', 'bill-two', payment('other-receipt', 1000));
 assert.equal((await getDoc(billRef(db))).data()?.paidPaise, 0);
 assert.equal((await getDoc(billRef(db, 'bill-two', 'merchant-two'))).data()?.paidPaise, 1000);
 await setDoc(merchantRef(db, 'unbilled'), merchant('unbilled'));
 await deleteUnbilledMerchant(db, 'owner', 'unbilled');
 assert.equal((await getDoc(merchantRef(db, 'unbilled'))).exists(), false);
});
test('rules reject orphan bills, fractional amounts, and inverted periods', async () => {
 const db = database(); await setDoc(merchantRef(db), merchant('merchant-one'));
 await assertFails(setDoc(billRef(db), bill())); // Missing billingStarted marker.
 await updateDoc(merchantRef(db), { billingStarted: true });
 for (const change of [{ amountPaise: -1 }, { amountPaise: 1.5 }, { paidPaise: 1 }, { periodEnd: '2025-01-01' }, { dueOn: '2025-01-01' }, { currency: 'USD' }]) await assertFails(setDoc(billRef(db), { ...bill(), ...change }));
 await assert.rejects(createBill(db, 'owner', 'does-not-exist', bill()), /no longer exists/);
});
