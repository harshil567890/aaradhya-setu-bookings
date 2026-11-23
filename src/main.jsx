import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Eye, EyeOff, Flower2, LoaderCircle } from 'lucide-react';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/dm-serif-text/latin-400.css';
import './base.css';
import Dashboard from './Dashboard.jsx';

async function sessionRequest(method = 'GET', data) {
  const response = await fetch('/api/session', {
    method, cache: 'no-store', credentials: 'same-origin',
    ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'The booking service is unavailable. Try again.');
  return result;
}

function Entry({ session, authenticate }) {
  const [show, setShow] = useState(false);
  const [password, setPassword] = useState('');
  const [activity, setActivity] = useState('');
  const [error, setError] = useState('');
  async function enter(mode) {
    setActivity(mode);
    setError('');
    try { await authenticate(mode === 'demo' ? { demo: true } : { password }); }
    catch (issue) { setError(issue.message); }
    finally { setActivity(''); }
  }
  return <main className="entry">
    <div className="entry-scenery">
      <div className="entry-brand"><span><Flower2 size={22} /></span>Aaradhya Setu</div>
      <div className="entry-caption"><span className="entry-rule" /><p>Temple operations</p><h1>Puja booking<br />workspace</h1></div>
    </div>
    <div className="entry-panel"><div className="entry-inner">
      <p className="entry-kicker">Booking administration</p>
      <h2>Welcome back</h2>
      <p className="entry-description">Sign in to view bookings and manage ceremony updates.</p>
      <form onSubmit={event => { event.preventDefault(); enter('password'); }}>
        <label htmlFor="admin-password">Password</label>
        <div className="entry-input"><input id="admin-password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        {error && <p className="entry-error" role="alert">{error}</p>}
        <button className="entry-primary" disabled={Boolean(activity)}>{activity === 'password' ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button>
      </form>
      {session.demoAvailable && <div className="entry-demo"><h3>Explore the demo</h3>
        <p>{session.localDemo ? 'Try the dashboard with sample puja bookings.' : 'Try all four booking statuses in your own sample workspace. Your changes last for eight hours.'}</p>
        <button className="entry-secondary" disabled={Boolean(activity)} onClick={() => enter('demo')}>{activity === 'demo' ? 'Opening…' : 'Open demo'}<ArrowRight size={16}/></button>
      </div>}
    </div></div>
  </main>;
}

function App() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      let result = await sessionRequest();
      if (!active) return;
      const url = new URL(window.location.href);
      const demoLink = url.searchParams.get('demo') === '1';
      if (!result.authenticated && result.demoAvailable && (demoLink || (result.localDemo && !sessionStorage.getItem('signedOut')))) {
        result = await sessionRequest('POST', { demo: true });
      }
      if (!active) return;
      if (demoLink) {
        url.searchParams.delete('demo');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
      setSession(result);
    }
    setError('');
    load().catch(issue => { if (active) setError(issue.message); });
    return () => { active = false; };
  }, [retry]);
  const unauthorized = useCallback(() => {
    setSession(previous => previous ? { ...previous, authenticated: false, user: null } : previous);
  }, []);
  const signOut = useCallback(async () => {
    try {
      await sessionRequest('DELETE');
      sessionStorage.setItem('signedOut', '1');
      setError('');
      unauthorized();
    } catch (issue) { setError(issue.message); }
  }, [unauthorized]);
  async function authenticate(data) {
    const result = await sessionRequest('POST', data);
    sessionStorage.removeItem('signedOut');
    setError('');
    setSession(result);
  }
  if (!session) return <main className="loading-screen">{error ?
    <div role="alert"><p>{error}</p><button className="entry-secondary" onClick={() => setRetry(i => i + 1)}>Try again</button></div> :
    <div role="status"><LoaderCircle size={21} /> Opening booking workspace…</div>}</main>;
  if (!session.authenticated) return <Entry session={session} authenticate={authenticate} />;
  return <>{error && <div className="app-alert" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <Dashboard user={session.user} onUnauthorized={unauthorized} onSignOut={signOut} /></>;
}

createRoot(document.getElementById('root')).render(<App />);
