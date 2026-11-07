import { useEffect, useRef, useState } from 'react';
import { API_BASE, api, getToken, MANAGER_ROLES } from '../api.js';
import { useAuth } from '../auth.jsx';

const EMPLOYEE_PROMPTS = ['Have I clocked in today?', 'Show my attendance for the last 14 days'];
const MANAGER_PROMPTS = [
  'Who is late or absent today?',
  'Who forgot to clock out recently?',
  "Draft this week's attendance summary for me to review",
];

let counter = 1;
const uid = () => `m${counter++}`;

// One Server-Sent Event block ("event: x\ndata: {...}") -> { event, data }.
function parseEvent(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue; // heartbeat comment
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join('\n')) };
  } catch {
    return null;
  }
}

export default function AssistantChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const prompts = MANAGER_ROLES.includes(user.role) ? MANAGER_PROMPTS : EMPLOYEE_PROMPTS;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items, progress, open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = (id, changes) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...changes } : i)));

  // Only plain text turns go back to the server. Confirmation cards and errors stay in the browser.
  function toHistory(list, latest) {
    const turns = [...list, latest]
      .filter((i) => (i.role === 'user' || i.role === 'assistant') && i.text)
      .map((i) => ({ role: i.role, content: i.text.slice(0, 4000) }));
    const recent = turns.slice(-20);
    while (recent.length && recent[0].role !== 'user') recent.shift();
    return recent;
  }

  async function send(text) {
    const clean = text.trim();
    if (!clean || busy) return;
    const userItem = { id: uid(), role: 'user', text: clean };
    const replyId = uid();
    const history = toHistory(items, userItem);
    setItems((l) => [...l, userItem, { id: replyId, role: 'assistant', text: '' }]);
    setInput('');
    setBusy(true);
    setProgress('Thinking…');

    const ac = new AbortController();
    abortRef.current = ac;

    const handle = ({ event, data }) => {
      if (event === 'text') {
        setItems((l) => l.map((i) => (i.id === replyId ? { ...i, text: i.text ? `${i.text}\n\n${data.text}` : data.text } : i)));
      } else if (event === 'tool_start') {
        setProgress(data.label || 'Working…');
      } else if (event === 'tool_end') {
        setProgress('Thinking…');
      } else if (event === 'pending_confirmation') {
        setItems((l) => [...l, { id: uid(), role: 'pending', ...data, state: 'waiting' }]);
      } else if (event === 'error') {
        setItems((l) => [...l, { id: uid(), role: 'error', text: data.message }]);
      }
    };

    try {
      const res = await fetch(`${API_BASE}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ messages: history }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const ev = parseEvent(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 2);
          if (ev) handle(ev);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setItems((l) => [...l, { id: uid(), role: 'error', text: e.message }]);
    } finally {
      setBusy(false);
      setProgress('');
      abortRef.current = null;
    }
  }

  const cancel = () => abortRef.current?.abort();

  async function decide(item, approve) {
    patch(item.id, { state: 'working', error: '' });
    try {
      await api('/agent/confirm', { method: 'POST', body: { confirmationId: item.confirmationId, approve } });
      patch(item.id, { state: approve ? 'done' : 'cancelled' });
      // Generic note only: the card summary contains stored names, which should not be replayed to the model.
      setItems((l) => [
        ...l,
        { id: uid(), role: 'assistant', text: approve ? 'The pending change was confirmed and applied.' : 'The pending change was cancelled.' },
      ]);
    } catch (e) {
      patch(item.id, { state: 'failed', error: e.message });
    }
  }

  if (!open) {
    return (
      <button className="assistant-fab" onClick={() => setOpen(true)} aria-label="Open the ClockAm assistant">
        Ask ClockAm
      </button>
    );
  }

  return (
    <section className="assistant" aria-label="ClockAm assistant">
      <header>
        <strong>ClockAm assistant</strong>
        <span>
          {items.length > 0 && !busy && (
            <button className="icon-btn" onClick={() => setItems([])}>Clear</button>
          )}
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close assistant">✕</button>
        </span>
      </header>

      <div className="assistant-msgs" aria-live="polite">
        {!items.length && (
          <div className="assistant-empty">
            <p>
              Ask about attendance in your workplace. I can look things up and prepare changes, but you always confirm them,
              and I can never clock anyone in or out.
            </p>
            <div className="chips">
              {prompts.map((p) => (
                <button key={p} className="chip" onClick={() => send(p)}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {items.map((i) => {
          if (i.role === 'user') return <div key={i.id} className="bubble user">{i.text}</div>;
          if (i.role === 'assistant') return i.text ? <div key={i.id} className="bubble bot">{i.text}</div> : null;
          if (i.role === 'error') return <div key={i.id} className="bubble err">{i.text}</div>;
          return (
            <div key={i.id} className="assistant-pending">
              <b>Waiting for your confirmation</b>
              <p>{i.summary}</p>
              {i.error && <p className="error">{i.error}</p>}
              {i.state === 'waiting' && (
                <div className="row">
                  <button className="btn small" onClick={() => decide(i, true)}>Confirm</button>
                  <button className="btn small ghost" onClick={() => decide(i, false)}>Cancel</button>
                </div>
              )}
              {i.state === 'working' && <p className="muted">Working…</p>}
              {i.state === 'done' && <p className="success">Confirmed and applied.</p>}
              {i.state === 'cancelled' && <p className="muted">Cancelled.</p>}
              {i.state === 'failed' && <p className="muted">This request can no longer be confirmed. Ask again if you still need it.</p>}
            </div>
          );
        })}

        {busy && <div className="assistant-progress">{progress}</div>}
        <div ref={endRef} />
      </div>

      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about attendance…" maxLength={1000} disabled={busy} />
        {busy ? (
          <button type="button" className="btn ghost" onClick={cancel}>Stop</button>
        ) : (
          <button className="btn" disabled={!input.trim()}>Send</button>
        )}
      </form>
    </section>
  );
}
