import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { Organization } from '../models/Organization.js';
import { requireAuth } from '../middleware/auth.js';
import { isPlatformAdmin } from '../middleware/platformAdmin.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { chatBodySchema, confirmBodySchema } from '../agent/schemas.js';
import { runAgent } from '../agent/agentLoop.js';
import { callModel } from '../agent/llm.js';
import { buildSystemPrompt } from '../agent/systemPrompt.js';
import { tools, toolDefinitionsFor, executeTool, executeConfirmed } from '../agent/toolRegistry.js';
import { confirmationStore } from '../agent/confirmations.js';
import { billingGate } from '../middleware/billing.js';
import { logToolCall } from '../agent/logger.js';
import { todayKey } from '../services/attendance.service.js';

const router = Router();
router.use(requireAuth, billingGate);

// Per signed-in user (not per IP): the limiter runs after requireAuth.
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: env.AGENT_RATE_LIMIT_PER_MIN,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'You are sending messages too quickly. Please wait a moment.' },
  })
);

export async function buildContext(req) {
  const org = await Organization.findById(req.user.organization);
  if (!org) throw new HttpError(404, 'Workplace not found');
  return { user: req.user, org, isPlatformAdmin: isPlatformAdmin(req.user) };
}

router.post(
  '/chat',
  validate(chatBodySchema),
  asyncHandler(async (req, res) => {
    if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'The assistant is not configured yet');

    const ctx = await buildContext(req);
    const stream = req.query.stream !== 'false';
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, env.AGENT_TIMEOUT_MS);

    const deps = {
      callModel,
      executeTool,
      tools,
      toolDefinitions: toolDefinitionsFor(ctx),
      systemPrompt: buildSystemPrompt({ user: ctx.user, org: ctx.org, today: todayKey(ctx.org) }),
      maxSteps: env.AGENT_MAX_STEPS,
    };

    if (!stream) {
      const out = { reply: '', pending: [], toolCalls: [] };
      const emit = (event, data) => {
        if (event === 'text') out.reply += (out.reply ? '\n\n' : '') + data.text;
        else if (event === 'pending_confirmation') out.pending.push(data);
        else if (event === 'tool_start') out.toolCalls.push(data.name);
      };
      try {
        await runAgent({ ctx, messages: req.body.messages, emit, signal: ac.signal, deps });
      } catch (e) {
        if (timedOut) throw new HttpError(504, 'The assistant took too long. Please try again.');
        throw e;
      } finally {
        clearTimeout(timer);
      }
      return res.json(out);
    }

    // Server-Sent Events. No compression middleware is used on this app, and X-Accel-Buffering stops proxy buffering.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
    res.on('close', () => {
      if (!res.writableEnded) ac.abort(); // client pressed cancel or disconnected
    });

    try {
      await runAgent({ ctx, messages: req.body.messages, emit, signal: ac.signal, deps });
    } catch (e) {
      if (!ac.signal.aborted || timedOut) {
        emit('error', { message: timedOut ? 'The assistant took too long. Please try again.' : e instanceof HttpError ? e.message : 'Something went wrong.' });
        if (!(e instanceof HttpError)) console.error('Agent error:', e);
      }
    } finally {
      clearTimeout(timer);
      clearInterval(heartbeat);
      res.end();
    }
  })
);

// Runs (or cancels) an action the assistant proposed. Single use, same user, before expiry.
router.post(
  '/confirm',
  validate(confirmBodySchema),
  asyncHandler(async (req, res) => {
    const ctx = await buildContext(req);
    const { confirmationId, approve } = req.body;
    const record = await confirmationStore.consume(ctx, confirmationId, approve ? 'confirmed' : 'cancelled');
    if (!record) throw new HttpError(404, 'Confirmation not found, already used, or expired');

    if (!approve) {
      await logToolCall({ ctx, tool: record.tool, input: record.input, status: 'cancelled' });
      return res.json({ status: 'cancelled' });
    }
    const result = await executeConfirmed(ctx, record);
    res.json({ status: 'executed', result });
  })
);

export default router;
