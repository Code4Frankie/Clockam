import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requirePlatformAdmin } from '../middleware/platformAdmin.js';
import { getSeoReport } from '../seo/report.js';
import { SeoSuggestion } from '../models/SeoSuggestion.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

// Latest crawl grouped by page type, with regressions against the previous run.
router.get(
  '/report',
  asyncHandler(async (_req, res) => {
    res.json(await getSeoReport());
  })
);

// Agent-drafted title/description suggestions waiting for approval.
router.get(
  '/suggestions',
  asyncHandler(async (_req, res) => {
    res.json(await SeoSuggestion.find().sort({ createdAt: -1 }).limit(50));
  })
);

router.post(
  '/suggestions/:id',
  validate(z.object({ status: z.enum(['approved', 'rejected']) }).strict()),
  asyncHandler(async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'Invalid id');
    const doc = await SeoSuggestion.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { status: req.body.status, decidedBy: req.user._id, decidedAt: new Date() },
      { new: true }
    );
    if (!doc) throw new HttpError(404, 'Suggestion not found or already decided');
    res.json(doc);
  })
);

export default router;
