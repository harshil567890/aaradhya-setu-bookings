import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle, ArrowRight, CalendarDays, Check, ChevronRight, Clock3,
  IndianRupee, Landmark, LoaderCircle, Mail, MapPin, Phone, X,
} from 'lucide-react'

export const statuses = ['Pending', 'Confirmed', 'In Progress', 'Completed']
export const statusKeys = ['pending', 'confirmed', 'inProgress', 'completed']
export const initialQuery = { q: '', status: '', puja: '', sort: 'date', order: 'desc', page: 1, pageSize: 8 }
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export function formatAmount(value) { return currency.format(value) }
export function formatDate(date) { return dateFormat.format(new Date(date + 'T12:00:00Z')) }
function formatTime(time) { return timeFormat.format(new Date('2000-01-01T' + time + ':00Z')) }
export function initials(name) {
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase()
}

export async function requestBooking(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) {
    const error = new Error(result?.message || (typeof result?.error === 'string' ? result.error : 'Unable to reach the booking service. Please try again.'))
    error.status = response.status
    throw error
  }
  return result
}

export function Avatar({ name }) {
  const hue = Array.from(name).reduce((value, char) => value + char.codePointAt(0), 0) % 6
  return <span aria-hidden="true" className={'db-avatar db-avatar-' + hue}>{initials(name)}</span>
}

export function StatusBadge({ value }) {
  return <span className={'db-badge db-badge-' + statusKeys[statuses.indexOf(value)]}><i />{value}</span>
}

export function BookingTable({ items, openBooking }) {
  return <table className="db-table">
    <caption className="db-sr">Puja booking register</caption>
    <thead><tr>
      {['Booking ID', 'Devotee', 'Puja', 'Date', 'Amount', 'Status'].map(label => <th key={label} scope="col">{label}</th>)}
      <th scope="col"><span className="db-sr">Details</span></th>
    </tr></thead>
    <tbody>{items.map(booking => <tr key={booking.id} onClick={() => openBooking(booking.id)}>
      <td className="db-id-cell"><button className="db-id-button" aria-label={'View booking ' + booking.id}
        onClick={event => { event.stopPropagation(); openBooking(booking.id) }}>{booking.id}</button></td>
      <td className="db-person-cell"><div className="db-person"><Avatar name={booking.devotee} /><span>{booking.devotee}</span></div></td>
      <td className="db-puja-cell"><span>{booking.puja}</span><small>{booking.temple}</small></td>
      <td className="db-date-cell"><CalendarDays aria-hidden="true" size={13} />{formatDate(booking.date)}</td>
      <td className="db-amount-cell">{formatAmount(booking.amount)}</td>
      <td className="db-status-cell"><StatusBadge value={booking.status} /></td>
      <td aria-hidden="true" className="db-row-chevron"><ChevronRight size={15} /></td>
    </tr>)}</tbody>
  </table>
}

// Native dialogs manage focus trapping, Escape, and focus restoration for both
// the mobile navigation and the booking inspector.
export function Panel({ children, onClose, label, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    const previouslyFocused = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus()
      else document.getElementById('db-register-title')?.focus()
    }
  }, [])
  return <dialog ref={ref} className={'db-panel ' + className} aria-label={label}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== ref.current) return
      const bounds = ref.current.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}>
    {children}
  </dialog>
}

function DetailField({ icon: Icon, label, children }) {
  return <div className="db-detail-field"><Icon size={17} aria-hidden="true" /><div><dt>{label}</dt><dd>{children}</dd></div></div>
}

const historyTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
})

export function BookingDetails({ id, onClose, onSaved, onUnauthorized }) {
  const [booking, setBooking] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const path = '/api/bookings/' + encodeURIComponent(id)

  useEffect(() => {
    const controller = new AbortController()
    requestBooking(path, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      setBooking(data)
      setStatus(data.status)
    }).catch(cause => {
      if (controller.signal.aborted) return
      if (cause.status === 401) onUnauthorized()
      else setError(cause.message)
    })
    return () => controller.abort()
  }, [path, attempt, onUnauthorized])

  async function saveStatus(event) {
    event.preventDefault()
    if (saving || !booking || booking.status === status) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const updated = await requestBooking(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, version: booking.version }),
      })
      setBooking(updated)
      setStatus(updated.status)
      setNotice('Status updated.')
      onSaved()
    } catch (cause) {
      if (cause.status === 401) onUnauthorized()
      else if (cause.status === 409) {
        setBooking(null)
        setError('Another administrator updated this booking. Review its latest status before saving again.')
        setAttempt(value => value + 1)
        onSaved()
      } else setError(cause.message)
    } finally { setSaving(false) }
  }

  return <Panel className="db-inspector" label="Booking details" onClose={onClose}>
    <div className="db-panel-bar"><span>Booking details</span><button type="button" aria-label="Close details" className="db-icon-button" onClick={onClose}><X size={20} /></button></div>
    <div className="db-detail-body">
      <div className="db-detail-title"><div className="db-temple-icon"><Landmark size={24} /></div><h2>{id}</h2>{booking && <StatusBadge value={booking.status} />}</div>
      {error && <p role="alert" className="db-alert"><AlertCircle size={16} />{error}</p>}
      {!booking && !error && <p role="status" className="db-loading"><LoaderCircle className="db-spin" size={16} /> Loading booking…</p>}
      {!booking && error && <button type="button" className="db-outline-button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Retry</button>}
      {booking && <>
        <section className="db-detail-section"><h3>Devotee</h3>
          <div className="db-detail-person"><Avatar name={booking.devotee} /><strong>{booking.devotee}</strong></div>
          <dl><DetailField icon={Mail} label="Email">{booking.email}</DetailField><DetailField icon={Phone} label="Phone">{booking.phone}</DetailField></dl>
        </section>
        <section className="db-detail-section"><h3>Puja details</h3>
          <div className="db-detail-puja">{booking.puja}</div>
          <dl><DetailField icon={MapPin} label="Temple">{booking.temple}</DetailField>
            <DetailField icon={CalendarDays} label="Date">{formatDate(booking.date)}</DetailField>
            <DetailField icon={Clock3} label="Time (IST)">{formatTime(booking.time)}</DetailField>
            <DetailField icon={IndianRupee} label="Amount">{formatAmount(booking.amount)}</DetailField>
          </dl>
        </section>
        <form className="db-detail-section db-status-form" onSubmit={saveStatus}>
          <label htmlFor="db-edit-status">Booking status</label>
          <select id="db-edit-status" value={status} disabled={saving} onChange={event => { setStatus(event.target.value); setNotice(''); setError('') }}>
            {statuses.map(value => <option key={value}>{value}</option>)}
          </select>
          <button className="db-primary-button" disabled={saving || booking.status === status}>
            {saving ? 'Saving…' : 'Save changes'}{saving ? <LoaderCircle size={16} className="db-spin" /> : <ArrowRight size={16} />}
          </button>
          {notice && <p className="db-success" role="status"><Check size={16} />{notice}</p>}
        </form>
        <section className="db-detail-section"><h3>Status history</h3>
          {booking.history?.length ? <ol className="db-history">{booking.history.slice().reverse().map((entry, index) =>
            <li key={booking.version - index}><strong>{entry.from} → {entry.to}</strong>
              <small>{entry.actor} · <time dateTime={entry.at}>{historyTime.format(new Date(entry.at))} IST</time></small>
            </li>)}</ol> : <p>No status changes recorded yet.</p>}
        </section>
      </>}
    </div>
  </Panel>
}
