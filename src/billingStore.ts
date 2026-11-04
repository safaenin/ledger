import { doc, getDoc, runTransaction, type Firestore } from 'firebase/firestore';
import { validateBill, validatePayment, type Bill, type Payment } from './billing';
export async function createBill(db: Firestore, uid: string, merchantId: string, bill: Bill) {
  validateBill(bill);
  const merchantRef = doc(db, 'users', uid, 'merchants', merchantId);
  const billRef = doc(merchantRef, 'bills', bill.id);
  try { await runTransaction(db, async transaction => {
    const merchant = await transaction.get(merchantRef);
    const existing = await transaction.get(billRef);
    if (!merchant.exists()) throw new Error('This merchant no longer exists.');
    if (existing.exists()) {
      if (!sameBill(existing.data() as Bill, bill)) throw new Error('This submission was already saved with different bill details. Close and raise a new bill.');
      return;
    }
    transaction.update(merchantRef, { billingStarted: true });
    transaction.set(billRef, { ...bill, paidPaise: 0, lastPaymentId: '' });
  }); } catch (error) {
    const committed = await getDoc(billRef).catch(() => null);
    if (!committed?.exists() || !sameBill(committed.data() as Bill, bill)) throw error;
  }
}
export async function recordPayment(db: Firestore, uid: string, merchantId: string, billId: string, payment: Payment) {
  const billRef = doc(db, 'users', uid, 'merchants', merchantId, 'bills', billId);
  const paymentRef = doc(billRef, 'payments', payment.id);
  try { await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(billRef);
    const existing = await transaction.get(paymentRef);
    if (!snapshot.exists()) throw new Error('This bill no longer exists.');
    if (existing.exists()) {
      if (!samePayment(existing.data() as Payment, payment)) throw new Error('This receipt was already saved with different details. Close and record a new payment.');
      return;
    }
    const bill = snapshot.data() as Bill;
    validatePayment(payment, bill);
    transaction.set(paymentRef, payment);
    transaction.update(billRef, { paidPaise: bill.paidPaise + payment.amountPaise, lastPaymentId: payment.id, updatedAt: payment.createdAt });
  }); } catch (error) {
    // Rules may reject a simultaneous duplicate before transaction conflict retry.
    // Confirm the identical receipt committed before treating it as successful.
    const committed = await getDoc(paymentRef).catch(() => null);
    if (!committed?.exists() || !samePayment(committed.data() as Payment, payment)) throw error;
  }
}
export async function deleteUnbilledMerchant(db: Firestore, uid: string, merchantId: string) {
  const merchantRef = doc(db, 'users', uid, 'merchants', merchantId);
  await runTransaction(db, async transaction => {
    const merchant = await transaction.get(merchantRef);
    if (merchant.data()?.billingStarted) throw new Error('Merchants with bills cannot be deleted. Their billing history must be kept.');
    transaction.delete(merchantRef);
  });
}

function samePayment(a: Payment, b: Payment) {
  return a.id === b.id && a.amountPaise === b.amountPaise && a.paidOn === b.paidOn && a.method === b.method && a.reference === b.reference;
}
function sameBill(a: Bill, b: Bill) {
  return a.id === b.id && a.number === b.number && a.description === b.description && a.cadence === b.cadence && a.periodStart === b.periodStart && a.periodEnd === b.periodEnd && a.issuedOn === b.issuedOn && a.dueOn === b.dueOn && a.amountPaise === b.amountPaise && a.currency === b.currency;
}
