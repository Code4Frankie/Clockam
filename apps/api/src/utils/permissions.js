// Who may change whom. Returns a reason string when the change is not allowed, or null when it is.
export function whyCannotEdit(actorRole, target, patch = {}) {
  if (target.role === 'owner') return 'The owner account cannot be changed here';
  if (actorRole !== 'owner' && (target.role === 'admin' || patch.role === 'admin')) return 'Only the owner can change admins';
  return null;
}
