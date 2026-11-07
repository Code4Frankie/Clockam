import { HttpError } from '../utils/http.js';
import { assertNoOperatorKeys, assertNoSecrets, hashInput } from '../utils/guards.js';
import { isAllowed } from './defineTool.js';
import { logToolCall } from './logger.js';
import { confirmationStore, assertConfirmationValid } from './confirmations.js';
import getMyStatusToday from './tools/get_my_status_today.js';
import getMyAttendance from './tools/get_my_attendance.js';
import findEmployee from './tools/find_employee.js';
import getTodayOverview from './tools/get_today_overview.js';
import getAttendance from './tools/get_attendance.js';
import getReportSummary from './tools/get_report_summary.js';
import listLateAndAbsent from './tools/list_late_and_absent.js';
import proposeAttendanceCorrection from './tools/propose_attendance_correction.js';
import disableEmployee from './tools/disable_employee.js';
import enableEmployee from './tools/enable_employee.js';
import resetFingerprints from './tools/reset_fingerprints.js';
import getSeoReport from './tools/get_seo_report.js';
import listMissingClockouts from './tools/list_missing_clockouts.js';
import queueSeoSuggestion from './tools/queue_seo_suggestion.js';

const ALL = [
  getMyStatusToday,
  getMyAttendance,
  findEmployee,
  getTodayOverview,
  getAttendance,
  getReportSummary,
  listLateAndAbsent,
  listMissingClockouts,
  // Write tools: always confirmation-gated
  proposeAttendanceCorrection,
  disableEmployee,
  enableEmployee,
  resetFingerprints,
  // Platform admins only
  getSeoReport,
  queueSeoSuggestion,
];

export const tools = Object.fromEntries(ALL.map((t) => [t.name, t]));

// Only tools the signed-in user may use are shown to the model.
export function toolDefinitionsFor(ctx, toolMap = tools) {
  return Object.values(toolMap)
    .filter((t) => isAllowed(ctx, t))
    .map((t) => ({ name: t.name, description: t.description, input_schema: t.jsonSchema }));
}

const failure = (error, message) => ({ error, message });
const safeError = (e) => (e instanceof HttpError && e.status < 500 ? e.message : 'The action could not be completed.');
const zodMessage = (e) =>
  e?.issues ? e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') : String(e?.message || e);

/**
 * The single gate between the model and the application:
 * permission check -> operator-injection guard -> schema validation -> (confirmation | run) -> secret scan -> log.
 */
export async function executeTool(ctx, name, rawInput, deps = {}) {
  const { tools: toolMap = tools, logger = logToolCall, confirmations = confirmationStore } = deps;
  const tool = Object.hasOwn(toolMap, name) ? toolMap[name] : undefined;

  if (!tool || !isAllowed(ctx, tool)) {
    await logger({ ctx, tool: String(name).slice(0, 60), input: rawInput, status: 'denied' });
    return failure('not_available', 'That tool is not available to this user.');
  }

  let input;
  try {
    assertNoOperatorKeys(rawInput ?? {});
    input = tool.input.parse(rawInput ?? {});
  } catch (e) {
    await logger({ ctx, tool: tool.name, input: rawInput, status: 'invalid_input', error: zodMessage(e).slice(0, 300) });
    return failure('invalid_input', zodMessage(e));
  }

  try {
    if (tool.confirm) {
      const summary = await tool.summarize(ctx, input);
      const pending = await confirmations.create(ctx, tool.name, input, summary);
      await logger({ ctx, tool: tool.name, input, status: 'pending_confirmation' });
      return {
        status: 'pending_confirmation',
        confirmationId: pending.id,
        summary: summary.text,
        expiresAt: pending.expiresAt,
        message: 'NOT executed yet. The user must press Confirm in the app. Tell them what is waiting for their confirmation.',
      };
    }
    const data = JSON.parse(JSON.stringify((await tool.run(ctx, input)) ?? null));
    assertNoSecrets(data);
    await logger({ ctx, tool: tool.name, input, status: 'ok' });
    return { ok: true, data };
  } catch (e) {
    await logger({ ctx, tool: tool.name, input, status: 'error', error: String(e.message).slice(0, 300) });
    if (!(e instanceof HttpError)) console.error(`Tool ${tool.name} failed:`, e);
    return failure('tool_error', safeError(e));
  }
}

// Runs a confirmed write action. Permissions and the stored input are re-checked at execution time.
export async function executeConfirmed(ctx, record, deps = {}) {
  const { tools: toolMap = tools, logger = logToolCall } = deps;
  assertConfirmationValid(record, ctx);

  const tool = Object.hasOwn(toolMap, record.tool) ? toolMap[record.tool] : undefined;
  if (!tool || !tool.confirm || !isAllowed(ctx, tool)) throw new HttpError(403, 'You no longer have permission for this action');

  const input = tool.input.parse(record.input);
  if (hashInput(input) !== record.inputHash) throw new HttpError(409, 'The confirmation data was changed and cannot run');

  try {
    const data = JSON.parse(JSON.stringify((await tool.run(ctx, input)) ?? null));
    assertNoSecrets(data);
    await logger({ ctx, tool: tool.name, input, status: 'confirmed' });
    return data;
  } catch (e) {
    await logger({ ctx, tool: tool.name, input, status: 'error', error: String(e.message).slice(0, 300) });
    if (e instanceof HttpError) throw e;
    console.error(`Confirmed tool ${tool.name} failed:`, e);
    throw new HttpError(500, 'The action could not be completed');
  }
}
