import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { billStatus, dateLabel, isOverdue, money, type Bill, type Payment } from './billing';
import type { FirmProfile } from './FirmSettings';
import printStyles from './bill-print.css?raw';

type Props = {
  bill: Bill;
  merchant: { name: string; category: string; gstin: string; email?: string; phone?: string };
  firmProfile: FirmProfile | null;
  payments: Payment[];
  historyAvailable: boolean;
  onBack: () => void;
};

const printPage = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${printStyles}</style></head><body></body></html>`;

export default function BillPrint({ bill, merchant, firmProfile, payments, historyAvailable, onBack }: Props) {
  const [footer, setFooter] = useState('');
  const [includeGstin, setIncludeGstin] = useState(true);
  const [includeContact, setIncludeContact] = useState(false);
  const [includePayments, setIncludePayments] = useState(false);
  const [frameBody, setFrameBody] = useState<HTMLElement | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const status = billStatus(bill);
  const showPayments = historyAvailable && includePayments;

  function print() {
    const printWindow = frame.current?.contentWindow;
    if (!printWindow || !frameBody) return;
    printWindow.document.title = bill.number;
    printWindow.focus();
    printWindow.print();
  }

  return <section className="bill-print">
    <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={15} /> Bill details</button>
    <h2>Print bill</h2>
    <p>Customize the preview, then choose a printer or Save as PDF in the print dialog.</p>
    {!firmProfile && <p className="billing-form-note">Add your firm name and address in Settings to include them on your bills.</p>}
    <label>Footer note (optional)
      <textarea maxLength={500} rows={2} placeholder="Thank-you note or payment instructions" value={footer}
        onChange={event => setFooter(event.target.value)} />
    </label>
    <fieldset className="bill-print-options">
      <legend>Include in print</legend>
      {merchant.gstin && <label>
        <input type="checkbox" checked={includeGstin} onChange={event => setIncludeGstin(event.target.checked)} /> Merchant GSTIN
      </label>}
      {(merchant.email || merchant.phone) && <label>
        <input type="checkbox" checked={includeContact} onChange={event => setIncludeContact(event.target.checked)} /> Merchant contact details
      </label>}
      <label>
        <input type="checkbox" checked={showPayments} disabled={!historyAvailable}
          onChange={event => setIncludePayments(event.target.checked)} /> Payment history and references
      </label>
    </fieldset>
    {!historyAvailable && <p className="bill-print-hint">Payment history is unavailable in the preview until it loads.</p>}
    <div className="modal-actions bill-print-actions">
      <button type="button" className="primary" disabled={!frameBody} onClick={print}>
        <Printer size={16} /> Print / Save PDF
      </button>
    </div>
    <iframe ref={frame} className="bill-print-preview" title="Printable bill preview" srcDoc={printPage}
      sandbox="allow-same-origin allow-modals"
      onLoad={() => setFrameBody(frame.current?.contentDocument?.body ?? null)} />
    {frameBody && createPortal(<main>
      <header>
        {firmProfile && <div className="firm">
          <h1>{firmProfile.name}</h1>
          <p className="firm-address">{firmProfile.address}</p>
        </div>}
        {firmProfile ? <p className="reference">{bill.number}</p> : <h1>{bill.number}</h1>}
      </header>
      <section className="overview">
        <div>
          <h2>Billed to</h2>
          <p className="merchant-name">{merchant.name}</p>
          <p>{merchant.category}</p>
          {includeGstin && merchant.gstin && <p>GSTIN {merchant.gstin}</p>}
          {includeContact && <>
            {merchant.email && <p>{merchant.email}</p>}
            {merchant.phone && <p>{merchant.phone}</p>}
          </>}
        </div>
        <dl className="bill-dates">
          <div><dt>Issued</dt><dd>{dateLabel(bill.issuedOn)}</dd></div>
          <div><dt>Due</dt><dd>{dateLabel(bill.dueOn)}</dd></div>
          <div><dt>Status</dt><dd>{status}{isOverdue(bill) ? ' · Overdue' : ''}</dd></div>
        </dl>
      </section>
      <table className="services">
        <thead><tr><th scope="col">Service</th><th scope="col">Amount</th></tr></thead>
        <tbody><tr><td>
          <strong>{bill.description}</strong>
          <p>{bill.cadence} · {dateLabel(bill.periodStart)} - {dateLabel(bill.periodEnd)}</p>
        </td><td>{money(bill.amountPaise)}</td></tr></tbody>
      </table>
      <dl className="totals">
        <div><dt>Total billed</dt><dd>{money(bill.amountPaise)}</dd></div>
        <div><dt>Paid</dt><dd>{money(bill.paidPaise)}</dd></div>
        <div className="balance"><dt>Balance due</dt><dd>{money(bill.amountPaise - bill.paidPaise)}</dd></div>
      </dl>
      {showPayments && <section className="receipts">
        <h2>Payment history</h2>
        {payments.length ? <table>
          <thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col">Reference</th><th scope="col">Amount</th></tr></thead>
          <tbody>{payments.map(payment => <tr key={payment.id}>
            <td>{dateLabel(payment.paidOn)}</td><td>{payment.method}</td>
            <td>{payment.reference || '—'}</td><td>{money(payment.amountPaise)}</td>
          </tr>)}</tbody>
        </table> : <p>No payments recorded.</p>}
      </section>}
      {footer.trim() && <footer>{footer.trim()}</footer>}
    </main>, frameBody)}
  </section>;
}
