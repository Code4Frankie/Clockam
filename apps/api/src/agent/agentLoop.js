import { wrapToolResult } from '../utils/guards.js';

/**
 * Runs the tool-use loop: model -> tools (server-side) -> model ... until a final answer or the step limit.
 * Everything the model can reach goes through executeTool(), which enforces roles, validation and confirmation.
 * deps: { callModel, executeTool, toolDefinitions, systemPrompt, maxSteps, tools }
 */
export async function runAgent({ ctx, messages, emit, signal, deps }) {
  const { callModel, executeTool, toolDefinitions, systemPrompt, maxSteps, tools } = deps;
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let step = 0; step < maxSteps; step += 1) {
    if (signal?.aborted) return { status: 'cancelled' };

    const resp = await callModel({ system: systemPrompt, messages: convo, tools: toolDefinitions, signal });
    const blocks = Array.isArray(resp.content) ? resp.content : [];

    for (const b of blocks) if (b.type === 'text' && b.text) emit('text', { text: b.text });

    const toolUses = blocks.filter((b) => b.type === 'tool_use');
    if (resp.stop_reason !== 'tool_use' || !toolUses.length) {
      emit('done', { steps: step + 1 });
      return { status: 'done' };
    }

    convo.push({ role: 'assistant', content: blocks });
    const results = [];
    for (const tu of toolUses) {
      if (signal?.aborted) return { status: 'cancelled' };
      emit('tool_start', { id: tu.id, name: tu.name, label: tools?.[tu.name]?.label || 'Working…' });
      const result = await executeTool(ctx, tu.name, tu.input);
      if (result.status === 'pending_confirmation') {
        emit('pending_confirmation', {
          confirmationId: result.confirmationId,
          summary: result.summary,
          expiresAt: result.expiresAt,
          tool: tu.name,
        });
      }
      emit('tool_end', { id: tu.id, name: tu.name, ok: !result.error });
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: wrapToolResult(result), is_error: !!result.error });
    }
    convo.push({ role: 'user', content: results });
  }

  emit('text', { text: 'I reached my step limit before finishing. Please ask again with a narrower question.' });
  emit('done', { steps: maxSteps, limited: true });
  return { status: 'step_limit' };
}
