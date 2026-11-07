// Trims attendance rows to the fields the assistant needs (no GPS, no internal ids beyond what tools document).
export const attendanceRow = (r) => ({
  date: r.date,
  employee: r.user?.name,
  staffId: r.user?.staffId,
  clockIn: r.clockIn ?? null,
  clockOut: r.clockOut ?? null,
  status: r.status,
  method: r.method,
  minutesWorked: r.minutesWorked ?? 0,
});

export const personRow = (u) => ({ id: String(u._id), name: u.name, staffId: u.staffId, department: u.department || null });

export const MAX_ROWS = 200;
