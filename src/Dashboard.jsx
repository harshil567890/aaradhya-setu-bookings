import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle, ArrowDownUp, ArrowRight, BookOpen, CalendarDays, CalendarRange,
  ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Flower2, Inbox,
  LayoutGrid, ListFilter, LoaderCircle, LogOut, Menu, RotateCw, Search, X,
} from 'lucide-react'
import { BookingDetails, BookingTable, Panel, initialQuery, initials, requestBooking, statusKeys, statuses } from './booking-ui.jsx'
import './dashboard.css'

const sorts = [
  ['date:desc', 'Newest date first'], ['date:asc', 'Oldest date first'],
  ['amount:desc', 'Amount: high to low'], ['amount:asc', 'Amount: low to high'],
  ['devotee:asc', 'Devotee: A to Z'], ['devotee:desc', 'Devotee: Z to A'],
  ['id:asc', 'Booking ID: ascending'], ['id:desc', 'Booking ID: descending'],
]
const todayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

function Navigation({ status, selectStatus, user, onSignOut, close }) {
  return <>
    <div className="db-brand-row">
      <div className="db-brand"><span className="db-brand-mark"><Flower2 size={25} strokeWidth={1.55} /></span><span>Aaradhya Setu</span></div>
      {close && <button aria-label="Close navigation" onClick={close} className="db-icon-button"><X size={18} /></button>}
    </div>
    <nav className="db-nav" aria-label="Workspace navigation">
      <p className="db-nav-label">Workspace</p>
      <button className={'db-nav-item' + (!status ? ' is-active' : '')} aria-current={!status ? 'page' : undefined} onClick={() => selectStatus('')}><BookOpen size={18} /><span>Bookings</span></button>
      <p className="db-nav-label db-view-label">Status views</p>
      {statuses.map((value, index) => <button key={value} aria-label={'Show ' + value + ' bookings'} aria-current={status === value ? 'page' : undefined}
        className={'db-nav-item db-nav-view' + (status === value ? ' is-active' : '')} onClick={() => selectStatus(value)}>
        <span className={'db-nav-dot db-dot-' + statusKeys[index]} /><span>{value}</span>
      </button>)}
    </nav>
    <div className="db-account"><span className="db-account-initials" aria-hidden="true">{initials(user)}</span><div><strong>{user}</strong><small>Administrator</small></div>
      <button className="db-icon-button" onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
    </div>
  </>
}

function Overview({ summary }) {
  return <section className="db-overview" aria-labelledby="db-overview-title">
    <div className="db-overview-content"><h2 id="db-overview-title"><CalendarRange aria-hidden="true" size={16} />Booking overview</h2>
      <dl className="db-metrics">{[
        ['total', 'Total bookings'], ['pending', 'Pending'], ['confirmed', 'Confirmed'],
        ['inProgress', 'In progress'], ['completed', 'Completed'],
      ].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{summary ? summary[key].toLocaleString('en-IN') : '–'}</dd></div>)}</dl>
    </div>
  </section>
}

function Toolbar({ search, setSearch, query, change, pujas }) {
  const [panel, setPanel] = useState('')
  const controls = useRef(null)
  const filtersButton = useRef(null)
  const sortButton = useRef(null)
  const searchInput = useRef(null)
  const filterCount = Number(Boolean(query.status)) + Number(Boolean(query.puja))
  useEffect(() => {
    if (!panel) return
    const outside = event => { if (!controls.current?.contains(event.target)) setPanel('') }
    const escape = event => {
      if (event.key === 'Escape') {
        setPanel('')
        ;(panel === 'filters' ? filtersButton : sortButton).current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [panel])

  return <div className="db-toolbar">
    <div className="db-search"><Search size={17} aria-hidden="true" /><input ref={searchInput} type="search" aria-label="Search bookings" placeholder="Search bookings…" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} />
      {search && <button aria-label="Clear search" title="Clear search" onClick={() => { setSearch(''); searchInput.current?.focus() }}><X size={15} /></button>}
    </div>
    <div className="db-tools" ref={controls}>
      <div className="db-tool"><button ref={filtersButton} id="db-filters-trigger" aria-label="Filters" aria-expanded={panel === 'filters'} aria-controls={panel === 'filters' ? 'db-filters' : undefined}
        className={'db-outline-button' + (filterCount ? ' has-value' : '')} onClick={() => setPanel(panel === 'filters' ? '' : 'filters')}>
        <ListFilter size={16} />Filters{filterCount > 0 && <span className="db-filter-count">{filterCount}</span>}<ChevronDown size={13} />
      </button>
      {panel === 'filters' && <div className="db-popover" id="db-filters" role="group" aria-labelledby="db-filters-trigger">
        <label>Filter by status<select value={query.status} onChange={event => change({ status: event.target.value })}><option value="">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Filter by puja<select value={query.puja} onChange={event => change({ puja: event.target.value })}><option value="">All pujas</option>{pujas.map(value => <option key={value}>{value}</option>)}</select></label>
      </div>}
      </div>
      <div className="db-tool"><button ref={sortButton} id="db-sort-trigger" aria-label="Sort" aria-expanded={panel === 'sort'} aria-controls={panel === 'sort' ? 'db-sort' : undefined}
        className={'db-outline-button' + (query.sort !== 'date' || query.order !== 'desc' ? ' has-value' : '')} onClick={() => setPanel(panel === 'sort' ? '' : 'sort')}>
        <ArrowDownUp size={15} />Sort<ChevronDown size={13} />
      </button>
      {panel === 'sort' && <div className="db-popover" id="db-sort" role="group" aria-labelledby="db-sort-trigger">
        <label>Sort bookings<select value={query.sort + ':' + query.order} onChange={event => { const [sort, order] = event.target.value.split(':'); change({ sort, order }) }}>
          {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>}
      </div>
    </div>
  </div>
}

function Pagination({ data, changePage, busy }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const first = data.total ? (data.page - 1) * data.pageSize + 1 : 0
  return <div className="db-pagination">
    <span>Showing <strong>{first}–{Math.min(data.page * data.pageSize, data.total)}</strong> of <strong>{data.total}</strong> bookings</span>
    <div className="db-page-controls">
      <button className="db-page-button" aria-label="Previous page" disabled={busy || data.page <= 1} onClick={() => changePage(data.page - 1)}><ChevronLeft size={16} /></button>
      <span aria-live="polite">{data.page} <i>/</i> {pages}</span>
      <button className="db-page-button" aria-label="Next page" disabled={busy || data.page >= pages} onClick={() => changePage(data.page + 1)}><ChevronRight size={16} /></button>
    </div>
  </div>
}

export default function Dashboard({ onSignOut, user = 'Temple admin', onUnauthorized }) {
  const [query, setQuery] = useState(initialQuery)
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [failure, setFailure] = useState(null)
  const [settled, setSettled] = useState('')
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== '')).toString()
  const requestKey = params + '/' + revision
  const error = failure?.key === requestKey ? failure.message : ''
  const busy = settled !== requestKey && !error
  const refresh = () => setRevision(value => value + 1)
  const change = useCallback(patch => setQuery(previous => ({ ...previous, page: 1, ...patch })), [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(previous => previous.q === search.trim() ? previous : { ...previous, q: search.trim(), page: 1 })
    }, 180)
    return () => clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    requestBooking('/api/bookings?' + params, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      setData(result)
      setFailure(null)
      setSettled(requestKey)
    }).catch(cause => {
      if (controller.signal.aborted) return
      if (cause.status === 401) onUnauthorized()
      else setFailure({ key: requestKey, message: cause.message })
    })
    return () => controller.abort()
  }, [params, requestKey, onUnauthorized])

  useEffect(() => {
    if (!mobileNav) return
    const desktop = window.matchMedia('(min-width: 1051px)')
    const adapt = () => { if (desktop.matches) setMobileNav(false) }
    desktop.addEventListener('change', adapt)
    return () => desktop.removeEventListener('change', adapt)
  }, [mobileNav])

  function selectStatus(status) {
    setSearch('')
    change({ status, q: '', puja: '' })
    setMobileNav(false)
  }
  const nav = { status: query.status, selectStatus, user, onSignOut }
  const filtered = Boolean(query.puja || query.status || query.q)

  return <div className="db-shell">
    <a className="db-skip" href="#db-main">Skip to bookings</a>
    <aside className="db-sidebar"><Navigation {...nav} /></aside>
    {mobileNav && <Panel label="Navigation" className="db-mobile-nav" onClose={() => setMobileNav(false)}><Navigation {...nav} close={() => setMobileNav(false)} /></Panel>}
    <div className="db-workspace">
      <header className="db-topbar"><div className="db-breadcrumb"><button aria-label="Open navigation" className="db-menu db-icon-button" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
        <LayoutGrid className="db-crumb-icon" size={15} aria-hidden="true" /><span>Workspace</span><ChevronRight size={13} aria-hidden="true" /><strong>Bookings</strong></div>
        <span className="db-today"><CalendarDays size={15} />{todayFormat.format(new Date())}</span>
      </header>
      <main id="db-main" className="db-main" tabIndex={-1}>
        <div className="db-page-heading"><h1>Puja bookings</h1><button className="db-refresh db-outline-button" aria-label="Refresh bookings" onClick={refresh} disabled={busy}><RotateCw size={15} className={busy ? 'db-spin' : ''} /><span>Refresh</span></button></div>
        <Overview summary={data?.summary} />
        <section className="db-register" aria-labelledby="db-register-title">
          <div className="db-register-head"><span className="db-register-icon"><ClipboardList size={19} /></span><h2 id="db-register-title" tabIndex={-1}>Booking register</h2>{data && <span className="db-register-count">{data.total}</span>}</div>
          <Toolbar search={search} setSearch={setSearch} query={query} change={change} pujas={data?.pujas || []} />
          {(query.status || query.puja) && <div className="db-applied">
            {['status', 'puja'].filter(key => query[key]).map(key => <button key={key} onClick={() => change({ [key]: '' })} aria-label={'Remove ' + query[key] + ' filter'}>{query[key]}<X size={13} /></button>)}
          </div>}
          {error ? <div className="db-state"><AlertCircle size={24} /><h3>Couldn’t load bookings</h3><p role="alert">{error}</p><button className="db-outline-button" onClick={refresh}>Retry</button></div>
          : !data ? <div className="db-state" role="status"><LoaderCircle className="db-spin" size={23} /><p>Loading bookings…</p></div>
          : <><div aria-busy={busy} className={busy ? 'db-results is-loading' : 'db-results'}>
            {data.items.length ? <BookingTable items={data.items} openBooking={setSelected} />
              : <div className="db-state"><Inbox size={26} /><h3>No bookings found</h3>
                <p>{filtered ? 'Try a different search or clear the active filters.' : 'Bookings will appear here when they are available.'}</p>
                {filtered && <button className="db-outline-button" onClick={() => selectStatus('')}>Clear filters <ArrowRight size={14} /></button>}
              </div>}
          </div><Pagination data={data} changePage={page => change({ page })} busy={busy} /></>}
        </section>
      </main>
    </div>
    {selected && <BookingDetails key={selected} id={selected} onClose={() => setSelected(null)} onSaved={refresh} onUnauthorized={onUnauthorized} />}
  </div>
}
