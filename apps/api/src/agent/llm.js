import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

// Calls the Anthropic Messages API with fetch (no SDK dependency). The key stays on the server.
export async function callModel({ system, messages, tools, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL, max_tokens: 1500, system, messages, tools }),
    signal,
  });
  if (!res.ok) {
    console.error('Anthropic API error', res.status, (await res.text().catch(() => '')).slice(0, 300));
    throw new HttpError(502, 'The assistant service is unavailable right now');
  }
  return res.json();
}
