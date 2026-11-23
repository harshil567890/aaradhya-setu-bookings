import { useState } from 'react'
import { X } from 'lucide-react'
import { Panel, requestBooking } from './booking-ui.jsx'

export default function NewBooking({ onClose, onCreated, onUnauthorized, pujas }) {
  const [key] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    fields.amount = Number(fields.amount)
    setBusy(true)
    setError('')
    try {
      const { id } = await requestBooking('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(fields),
      })
      onCreated(id)
    } catch (issue) {
      if (issue.status === 401) onUnauthorized()
      else setError(issue.message)
    } finally { setBusy(false) }
  }
  return <Panel label="New booking" className="db-inspector" onClose={() => { if (!busy) onClose() }}>
    <div className="db-panel-bar"><span>Booking intake</span><button className="db-icon-button" aria-label="Close new booking" disabled={busy} onClick={onClose}><X size={20}/></button></div>
    <form className="db-detail-body db-intake" onSubmit={submit}>
      <h2>New booking</h2>
      <fieldset disabled={busy}><legend>Devotee</legend>
        <label>Devotee name<input name="devotee" autoComplete="name" maxLength={120} required /></label>
        <label>Email<input name="email" type="email" autoComplete="email" maxLength={120} required /></label>
        <label>Phone<input name="phone" type="tel" autoComplete="tel" maxLength={25} required /></label>
      </fieldset>
      <fieldset disabled={busy}><legend>Ceremony</legend>
        <label>Puja<input name="puja" list="known-pujas" maxLength={120} required /></label>
        <datalist id="known-pujas">{pujas.map(name => <option key={name} value={name}/>)}</datalist>
        <label>Temple<input name="temple" maxLength={120} required /></label>
        <label>Ceremony date<input name="date" type="date" required /></label>
        <label>Time (IST)<input name="time" type="time" required /></label>
        <label>Amount (₹)<input name="amount" type="number" min="0" max="10000000" step="1" required /></label>
      </fieldset>
      {error && <p role="alert" className="db-alert">{error}</p>}
      <button className="db-primary-button" disabled={busy}>{busy ? 'Saving…' : 'Create booking'}</button>
    </form>
  </Panel>
}
