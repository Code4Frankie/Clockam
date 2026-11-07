import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildSummary } from '../services/reports.service.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('owner', 'admin', 'manager'));

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function summaryFor(req) {
  const { from, to } = req.query;
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE.test(from) || !DATE.test(to)) {
    throw new HttpError(400, 'from and to (YYYY-MM-DD) are required');
  }
  return buildSummary({ orgId: req.user.organization, from, to });
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json(await summaryFor(req));
  })
);

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const rows = await summaryFor(req);
    const header = ['Name', 'Staff ID', 'Department', 'Days present', 'Days late', 'Hours worked'];
    const lines = rows.map((r) =>
      [r.name, r.staffId, r.department, r.daysPresent, r.daysLate, r.hoursWorked].map(csvCell).join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="clockam-${req.query.from}_to_${req.query.to}.csv"`);
    res.send([header.map(csvCell).join(','), ...lines].join('\n'));
  })
);

export default router;
