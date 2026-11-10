import { useEffect, useRef, useState, type FormEvent } from 'react';
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, CircleDollarSign, FileText, Pencil, Plus, Printer, Receipt, Search, Settings2, Trash2, Wallet, X } from 'lucide-react';
import { billStatus, cadences, dateLabel, isOverdue, money, parseAmount, paymentMethods, periodEnd, summarize, today, type Bill, type Cadence, type Payment } from './billing';
import { createBill, deleteBill, editBill, recordPayment } from './billingStore';
import BillPrint from './BillPrint';

type Props = { database: Firestore; uid: string; merchant: { id: string; name: string; gstin: string; category: string; email?: string; phone?: string }; onBack: () => void; onManage: () => void };
type Draft = { original?: Bill; id: string; description: string; cadence: Cadence; periodStart: string; periodEnd: string; issuedOn: string; dueOn: string; amount: string };
function newDraft(): Draft {
  const date = today();
  return { id: crypto.randomUUID(), description: '', cadence: 'Monthly', periodStart: date, periodEnd: periodEnd(date, 'Monthly'), issuedOn: date, dueOn: date, amount: '' };
}
export default function MerchantBilling({ database: db, uid, merchant, onBack, onManage }: Props) {
  const [bills, setBills] = useState<Bill[]>([]);
  const firebaseProjectId = db.app.options.projectId;
  const rulesUrl = firebaseProjectId ? `https://console.firebase.google.com/project/${encodeURIComponent(firebaseProjectId)}/firestore/databases/-default-/security/rules` : null;
  const [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState(''), [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null), [selectedId, setSelectedId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]), [paymentsLoaded, setPaymentsLoaded] = useState(false), [paymentsError, setPaymentsError] = useState('');
  const [paymentDraft, setPaymentDraft] = useState({ id: crypto.randomUUID(), amount: '', paidOn: today(), method: 'UPI' as Payment['method'], reference: '' });
  const [printing, setPrinting] = useState(false);
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('All bills');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = bills.find(b => b.id === selectedId);
  useEffect(() => {
    if (!db) return;
    setLoaded(false); setLoadError('');
    return onSnapshot(collection(db, 'users', uid, 'merchants', merchant.id, 'bills'), snapshot => {
      setBills(snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Bill).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.createdAt.localeCompare(a.createdAt)));
      setLoaded(true); setLoadError('');
    }, e => { setLoadError(e.code === 'permission-denied' ? `Billing access was denied in Firebase project ${firebaseProjectId || '(unknown)'}. Check that the billing rules were published in this project, then retry.` : 'Could not load bills. Check your connection and retry.'); setLoaded(false); });
  }, [db, uid, merchant.id, reload, firebaseProjectId]);
  useEffect(() => {
    setPayments([]); setPaymentsLoaded(false); setPaymentsError('');
    if (!db || !selectedId) return;
    return onSnapshot(collection(db, 'users', uid, 'merchants', merchant.id, 'bills', selectedId, 'payments'), snapshot => {
      setPayments(snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as Payment).sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.localeCompare(a.createdAt)));
      setPaymentsLoaded(true);
    }, () => setPaymentsError('Could not load payment history. Close and reopen this bill to retry.'));
  }, [db, uid, merchant.id, selectedId]);
  useEffect(() => { if (draft || selectedId) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [draft, selectedId]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  function close() { if (busy) return; setDraft(null); setSelectedId(null); setPrinting(false); setRecording(false); setError(''); }
  function openBill(bill: Bill) { setSelectedId(bill.id); setRecording(false); setError(''); }
  function startPayment() { if (!selected) return; setPaymentDraft({ id: crypto.randomUUID(), amount: ((selected.amountPaise - selected.paidPaise) / 100).toFixed(2), paidOn: today(), method: 'UPI', reference: '' }); setRecording(true); setError(''); }
  function startEdit(bill: Bill) {
    const { id, description, cadence, periodStart, periodEnd, issuedOn, dueOn, amountPaise } = bill;
    setDraft({ original: bill, id, description, cadence, periodStart, periodEnd, issuedOn, dueOn, amount: (amountPaise / 100).toFixed(2) });
    setError('');
  }

  function cancelDraft() {
    setDraft(null);
    setError('');
  }

  async function removeBill(bill: Bill) {
    if (busy || !window.confirm(`Permanently delete bill ${bill.number} for ${money(bill.amountPaise)}? This will remove it from your billing totals.`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteBill(db, uid, merchant.id, bill);
      setSelectedId(null);
      setNotice('Bill deleted');
    } catch (e) {
      setError(billChangeError(e, 'Could not delete bill. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function billChangeError(error: unknown, fallback: string) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
      return `Billing access was denied. Check that the latest Firestore rules are published in Firebase project ${firebaseProjectId || '(unknown)'}.`;
    }
    return error instanceof Error ? error.message : fallback;
  }

  async function submitBill(event: FormEvent) {
    event.preventDefault(); if (!draft || !db || busy) return;
    setBusy(true); setError('');
    try {
      const changes = {
        description: draft.description.trim(), cadence: draft.cadence,
        periodStart: draft.periodStart, periodEnd: draft.periodEnd,
        issuedOn: draft.issuedOn, dueOn: draft.dueOn, amountPaise: parseAmount(draft.amount),
      };
      if (draft.original) {
        await editBill(db, uid, merchant.id, draft.original, changes);
        setNotice('Bill updated');
      } else {
        const timestamp = new Date().toISOString();
        await createBill(db, uid, merchant.id, {
          ...changes, id: draft.id, number: `BILL-${draft.issuedOn.replaceAll('-', '')}-${draft.id.slice(0, 8).toUpperCase()}`,
          paidPaise: 0, currency: 'INR', lastPaymentId: '', createdAt: timestamp, updatedAt: timestamp,
        });
        setNotice('Bill raised successfully');
      }
      setDraft(null);
    } catch (e) {
      setError(billChangeError(e, 'Could not save bill. Please try again.'));
    }
    finally { setBusy(false); }
  }
  async function submitPayment(event: FormEvent) {
    event.preventDefault(); if (!selected || !db || busy) return;
    setBusy(true); setError('');
    try {
      await recordPayment(db, uid, merchant.id, selected.id, { id: paymentDraft.id, amountPaise: parseAmount(paymentDraft.amount), paidOn: paymentDraft.paidOn, method: paymentDraft.method, reference: paymentDraft.reference.trim(), createdAt: new Date().toISOString() });
      setRecording(false); setNotice('Payment recorded successfully');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record payment. Please try again.'); }
    finally { setBusy(false); }
  }
  const issueDateLocked = !!draft?.original && (selected?.paidPaise ?? draft.original.paidPaise) > 0;
  const totals = summarize(bills), overdue = bills.filter(b => isOverdue(b));
  const visible = bills.filter(b => `${b.number} ${b.description}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'All bills' || (filter === 'Overdue' ? isOverdue(b) : billStatus(b) === filter)));
  return <section className="billing-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> All merchants</button>
    <div className="page-heading billing-heading"><div><div className="eyebrow">MERCHANT OVERVIEW</div><h1>{merchant.name}</h1><p>{merchant.category}{merchant.gstin && <> <span>·</span> <span className="mono">{merchant.gstin}</span></>}</p></div><div className="billing-actions"><button className="secondary" onClick={onManage}><Settings2 size={15} /> Merchant details</button><button className="primary" disabled={!loaded} onClick={() => { setDraft(newDraft()); setError(''); }}><Plus size={17} /> Raise bill</button></div></div>
    <div className="billing-summary">{[
      { label: 'Bills generated', value: String(totals.count).padStart(2, '0'), note: 'All bills for this merchant', icon: FileText, tone: 'mint' },
      { label: 'Total billed', value: money(totals.billed), note: 'Value of all raised bills', icon: Receipt, tone: 'lilac' },
      { label: 'Total paid', value: money(totals.paid), note: 'Payments received and recorded', icon: Wallet, tone: 'mint' },
      { label: 'Outstanding', value: money(totals.outstanding), note: overdue.length ? `${overdue.length} overdue ${overdue.length === 1 ? 'bill' : 'bills'}` : 'Amount left to be paid', icon: CircleDollarSign, tone: 'cream' },
    ].map(({ label, value, note, icon: Icon, tone }) => <article key={label}><div className="stat-label">{label}<span className={`stat-icon ${tone}`}><Icon size={18} /></span></div><strong>{loaded ? value : '—'}</strong><p>{note}</p></article>)}</div>
    {notice && <div className="billing-notice" role="status"><Check size={16} />{notice}</div>}
    <section className="merchant-section"><div className="section-heading"><div><h2>Bills & payments <span>{loaded ? bills.length : '—'}</span></h2><p>Track every billing period, payment, and balance.</p></div><span className="live-label"><span /> INR · Indian rupee</span></div>
      <div className="filters"><label className="search"><Search size={18} /><input aria-label="Search bills" placeholder="Search bill number or description…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filter bills by status" value={filter} onChange={e => setFilter(e.target.value)}>{['All bills', 'Unpaid', 'Part paid', 'Paid', 'Overdue'].map(option => <option key={option}>{option}</option>)}</select></div>
      {loadError ? <div className="billing-load-error" role="alert"><p>{loadError}</p>{rulesUrl && <a className="rules-link" href={rulesUrl} target="_blank" rel="noreferrer">Open this project’s Firebase rules <ArrowUpRight size={13} /></a>}<button className="secondary" onClick={() => setReload(n => n + 1)}>Retry loading bills</button></div> : !loaded ? <div className="empty" role="status"><Receipt size={28} /><h3>Loading bills…</h3></div> : !visible.length ? <div className="empty"><Receipt size={30} /><h3>{bills.length ? 'No bills match your filters' : 'Start this merchant’s billing history'}</h3><p>{bills.length ? 'Try a different description or payment status.' : 'Raise a bill for your services, then record payments as they arrive.'}</p>{!bills.length && <button className="primary" onClick={() => setDraft(newDraft())}><Plus size={16} /> Raise first bill</button>}</div> : <div className="table-wrap"><table className="bills-table"><thead><tr><th>BILL / PERIOD</th><th>DUE DATE</th><th>AMOUNT</th><th>PAID / BALANCE</th><th>STATUS</th><th aria-label="View bill" /></tr></thead><tbody>{visible.map(bill => <tr key={bill.id} onClick={() => openBill(bill)}><td><button className="name-button" onClick={e => { e.stopPropagation(); openBill(bill); }}>{bill.description}</button><small>{bill.number}</small><small>{bill.cadence} · {dateLabel(bill.periodStart)} – {dateLabel(bill.periodEnd)}</small></td><td data-label="Due date">{dateLabel(bill.dueOn)}</td><td data-label="Bill amount" className="bill-amount">{money(bill.amountPaise)}</td><td data-label="Payment / balance"><span>{money(bill.paidPaise)} paid</span><small>{money(bill.amountPaise - bill.paidPaise)} left</small></td><td data-label="Status"><span className={`payment-status ${billStatus(bill).toLowerCase().replace(' ', '-')}`}>{billStatus(bill)}</span>{isOverdue(bill) && <small className="overdue-label">Overdue</small>}</td><td><button aria-label={`View bill ${bill.number}`} className="more" onClick={e => { e.stopPropagation(); openBill(bill); }}><ArrowUpRight size={17} /></button></td></tr>)}</tbody></table></div>}
      <div className="table-footer">{loaded ? `Showing ${visible.length} of ${bills.length} bills` : 'Waiting for billing data'}<span>Balances update as payments are recorded</span></div>
    </section>
    <div className="billing-help"><CalendarDays size={18} /><p>Raise bills for weekly, monthly, or custom service periods. Recording a payment updates your records; it does not collect money. Bills are raised manually.</p></div>
    <dialog ref={dialogRef} className="billing-dialog" aria-label={printing ? 'Print bill' : draft?.original ? 'Edit bill' : draft ? 'Raise a bill' : 'Bill and payment details'} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="modal"><button className="close" disabled={busy} aria-label="Close billing dialog" onClick={close}><X size={20} /></button>
      {draft ? <form onSubmit={submitBill}>
        <div className="modal-icon"><Receipt size={25} /></div>
        <h2>{draft.original ? 'Edit bill' : 'Raise a bill'}</h2>
        <p>{draft.original ? `${draft.original.number} · ${merchant.name}` : `For ${merchant.name}. Enter the final amount you are charging.`}</p>
        <label>Description
          <input required maxLength={200} placeholder="Services for the billing period" value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })} />
        </label>
        <div className="form-grid">
          <label>Billing frequency
            <select value={draft.cadence} onChange={e => {
              const cadence = e.target.value as Cadence;
              setDraft({ ...draft, cadence, periodEnd: periodEnd(draft.periodStart, cadence) });
            }}>
              {cadences.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Bill amount (₹)
            <input required type="text" inputMode="decimal" placeholder="0.00" value={draft.amount}
              onChange={e => setDraft({ ...draft, amount: e.target.value })} />
          </label>
          <label>Period start
            <input required type="date" value={draft.periodStart}
              onChange={e => setDraft({ ...draft, periodStart: e.target.value, periodEnd: periodEnd(e.target.value, draft.cadence) })} />
          </label>
          <label>Period end
            <input required type="date" min={draft.periodStart} value={draft.periodEnd}
              onChange={e => setDraft({ ...draft, periodEnd: e.target.value })} />
          </label>
          <label>Issue date
            <input required readOnly={issueDateLocked} type="date" max={today()} value={draft.issuedOn}
              onChange={e => {
                const issuedOn = e.target.value;
                setDraft({ ...draft, issuedOn, dueOn: draft.dueOn < issuedOn ? issuedOn : draft.dueOn });
              }} />
          </label>
          <label>Due date
            <input required type="date" min={draft.issuedOn} value={draft.dueOn}
              onChange={e => setDraft({ ...draft, dueOn: e.target.value })} />
          </label>
        </div>
        <div className="billing-form-note">
          {issueDateLocked
            ? 'The issue date is locked because this bill has payments. The bill amount must cover the payments already recorded.'
            : 'Enter the final amount you are charging, including any applicable taxes.'}
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={cancelDraft} disabled={busy}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Saving bill…' : draft.original ? 'Save changes' : 'Raise bill'}<Check size={16} /></button>
        </div>
      </form> : selected && (printing ? <BillPrint
        bill={selected} merchant={merchant} payments={payments}
        historyAvailable={paymentsLoaded && !paymentsError}
        onBack={() => setPrinting(false)}
      /> : <><div className="modal-icon"><FileText size={25} /></div><h2>{selected.description}</h2><p>{selected.number} · {merchant.name}</p><div className="bill-detail-top"><span className={`payment-status ${billStatus(selected).toLowerCase().replace(' ', '-')}`}>{billStatus(selected)}</span>{isOverdue(selected) && <span className="overdue-label">Overdue</span>}<span>{selected.cadence}</span></div><div className="bill-detail-amounts"><div><span>Bill amount</span><strong>{money(selected.amountPaise)}</strong></div><div><span>Paid</span><strong>{money(selected.paidPaise)}</strong></div><div><span>Balance</span><strong>{money(selected.amountPaise - selected.paidPaise)}</strong></div></div><dl><div><dt>Service period</dt><dd>{dateLabel(selected.periodStart)} – {dateLabel(selected.periodEnd)}</dd></div><div><dt>Issued on</dt><dd>{dateLabel(selected.issuedOn)}</dd></div><div><dt>Due on</dt><dd>{dateLabel(selected.dueOn)}</dd></div></dl>
      {!recording && <div className="modal-actions bill-actions">
        <button className="secondary" disabled={busy} onClick={() => setPrinting(true)}><Printer size={15} /> Print bill</button>
        <button className="secondary" disabled={busy} onClick={() => startEdit(selected)}><Pencil size={15} /> Edit bill</button>
        {selected.paidPaise === 0 && selected.lastPaymentId === '' &&
          <button className="secondary danger" disabled={busy} onClick={() => void removeBill(selected)}><Trash2 size={15} /> {busy ? 'Deleting…' : 'Delete bill'}</button>}
      </div>}
      {!recording && selected.paidPaise > 0 && <p className="billing-form-note">Bills with recorded payments are kept with their payment history.</p>}
      {!recording && error && <div className="error" role="alert">{error}</div>}
      {recording ? <form className="payment-form" onSubmit={submitPayment}><h3>Record a payment</h3><div className="form-grid"><label>Payment amount (₹)<input required inputMode="decimal" type="text" value={paymentDraft.amount} onChange={e => setPaymentDraft({ ...paymentDraft, amount: e.target.value })} /></label><label>Payment date<input required type="date" min={selected.issuedOn} max={today()} value={paymentDraft.paidOn} onChange={e => setPaymentDraft({ ...paymentDraft, paidOn: e.target.value })} /></label><label>Payment method<select value={paymentDraft.method} onChange={e => setPaymentDraft({ ...paymentDraft, method: e.target.value as Payment['method'] })}>{paymentMethods.map(method => <option key={method}>{method}</option>)}</select></label><label>Reference (optional)<input maxLength={200} placeholder="UTR, receipt number…" value={paymentDraft.reference} onChange={e => setPaymentDraft({ ...paymentDraft, reference: e.target.value })} /></label></div>{error && <div className="error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => { setRecording(false); setError(''); }}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Recording…' : 'Confirm payment'}<Check size={16} /></button></div></form> : selected.paidPaise < selected.amountPaise && <button className="primary record-payment" onClick={startPayment}><Plus size={16} /> Record payment</button>}
      <section className="payment-history"><h3>Payment history <span>{paymentsLoaded ? payments.length : '…'}</span></h3>{paymentsError ? <p className="overdue-label" role="alert">{paymentsError}</p> : !paymentsLoaded ? <p>Loading payments…</p> : !payments.length ? <p>No payments recorded for this bill yet.</p> : payments.map(payment => <article key={payment.id}><span className="payment-check"><Check size={15} /></span><div><strong>{money(payment.amountPaise)}</strong><p>{dateLabel(payment.paidOn)} · {payment.method}</p>{payment.reference && <p className="payment-reference">{payment.reference}</p>}</div><span>Received</span></article>)}</section></>)}
      {!draft && selectedId && !selected && <p role="status">This bill is no longer available. Close this window to return to the bill list.</p>}
    </div></dialog>
  </section>;
}
