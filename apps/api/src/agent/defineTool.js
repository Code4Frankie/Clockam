// Tool definitions. Kept free of database imports: each tool loads its services lazily inside run()/summarize(),
// so tool metadata (roles, schemas, confirmation flags) can be loaded and tested without a database.

export const ANY = ['owner', 'admin', 'manager', 'employee'];
export const MANAGER = ['owner', 'admin', 'manager'];
export const ADMIN = ['owner', 'admin'];

export function defineTool(def) {
  for (const k of ['name', 'label', 'description', 'roles', 'input', 'jsonSchema', 'run']) {
    if (!def[k]) throw new Error(`Tool definition is missing "${k}"`);
  }
  if (def.confirm && typeof def.summarize !== 'function') throw new Error(`Write tool "${def.name}" needs summarize()`);
  if (/clock/i.test(def.name) && /(in|out)$/i.test(def.name)) throw new Error('The assistant must never clock people in or out');
  return Object.freeze({ confirm: false, platformAdmin: false, ...def });
}

// Platform tools need the platform-admin flag; all others are decided by role.
export const isAllowed = (ctx, tool) => (tool.platformAdmin ? !!ctx.isPlatformAdmin : tool.roles.includes(ctx.user.role));
