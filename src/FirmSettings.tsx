import { useState, type FormEvent } from 'react';
import { doc, setDoc, type Firestore } from 'firebase/firestore';

export type FirmProfile = { name: string; address: string };

type Props = {
  database: Firestore;
  uid: string;
  profile: FirmProfile | null;
};

export default function FirmSettings({ database, uid, profile }: Props) {
  const [draft, setDraft] = useState<FirmProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fields = draft ?? profile ?? { name: '', address: '' };

  function changeField(field: keyof FirmProfile, value: string) {
    setDraft({ ...fields, [field]: value });
    setMessage('');
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !draft) return;
    const name = fields.name.trim();
    const address = fields.address.trim();
    if (!name || !address) {
      setError('Enter your firm name and address.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await setDoc(doc(database, 'users', uid, 'settings', 'firm'), { name, address });
      setDraft(null);
      setMessage('Firm details saved.');
    } catch {
      setError('Could not save firm details. Check your connection and Firestore rules, then try again.');
    } finally {
      setSaving(false);
    }
  }

  return <form className="merchant-section modal firm-settings" onSubmit={save}>
    <h2>Firm details</h2>
    <p>Your firm name and address appear on printed bills and PDFs.</p>
    <label>Firm name
      <input required maxLength={100} autoComplete="organization" value={fields.name} disabled={saving}
        onChange={event => changeField('name', event.target.value)} />
    </label>
    <label>Firm address
      <textarea required rows={4} maxLength={500} autoComplete="street-address" value={fields.address} disabled={saving}
        onChange={event => changeField('address', event.target.value)} />
    </label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="firm-settings-actions">
      <button type="submit" className="primary" disabled={saving || !draft}>
        {saving ? 'Saving…' : 'Save firm details'}
      </button>
      {message && <span role="status">{message}</span>}
    </div>
  </form>;
}
