// Clock-ins taken while the internet is down. They wait in this browser, in order, with the time they really happened,
// and are uploaded when the connection is back. The server ignores repeats, so a retry can never double-count.
const KEY = 'clockam.kiosk.queue';
export const MAX_QUEUED = 200;

const browserStorage = () => {
  try { return window.localStorage; } catch { return null; }
};

export function createQueue(storage = browserStorage()) {
  const read = () => {
    try {
      const v = JSON.parse(storage?.getItem(KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };
  const write = (items) => {
    try { storage?.setItem(KEY, JSON.stringify(items)); } catch { /* storage blocked or full: nothing more we can do */ }
  };

  return {
    size: () => read().length,
    // Returns false if the queue is full or storage is not available, so the caller can say so instead of pretending.
    add(item) {
      const items = read();
      if (!storage || items.length >= MAX_QUEUED) return false;
      write([...items, item]);
      return read().length === items.length + 1;
    },
    /**
     * Sends items oldest first. send(item) must resolve to 'sent', 'drop' (the server will never accept it) or 'retry'.
     * Stops at the first 'retry' so the order is kept.
     */
    async flush(send) {
      let sent = 0;
      let dropped = 0;
      for (;;) {
        const [next] = read();
        if (!next) break;
        const outcome = await send(next);
        if (outcome === 'retry') break;
        write(read().slice(1));
        if (outcome === 'sent') sent += 1; else dropped += 1;
      }
      return { sent, dropped, remaining: read().length };
    },
  };
}

// Decides what to do with a failed upload. Network trouble and server hiccups keep the punch, bad punches are dropped.
export function classifyFailure(err) {
  const s = err?.status;
  if (!s) return 'retry';                       // no answer at all: offline
  if ([401, 403, 408, 429].includes(s) || s >= 500) return 'retry';
  return 'drop';                                // 400, 404, 409, 422...: the server will never accept this one
}

// True when the punch should be saved for later instead of shown as an error.
export const isOfflineFailure = (err) => !err?.status || [502, 503, 504].includes(err.status);
