import { Router, Request, Response } from 'express';
import type { UserProfile, DailyLog, WeeklyLoad } from '../../../shared/types';
import {
  computeMacros,
  generateWeeklyPlan,
  getPeriodizationPhase,
  checkLegFatigueGate,
} from '../services/nutritionService';

const router = Router();

// POST /api/nutrition/macros
// Body: { profile, log, weeklyLoad }
router.post('/macros', (req: Request, res: Response) => {
  const { profile, log, weeklyLoad } = req.body as {
    profile: UserProfile;
    log: DailyLog;
    weeklyLoad: WeeklyLoad;
  };

  if (!profile || !log || !weeklyLoad) {
    return res.status(400).json({ error: 'Missing profile, log, or weeklyLoad' });
  }

  const gate = checkLegFatigueGate(weeklyLoad, log);
  if (gate.blocked) {
    return res.status(200).json({ blocked: true, message: gate.message, macros: null });
  }

  const macros = computeMacros(profile, log, weeklyLoad);
  return res.json({ blocked: false, macros });
});

// POST /api/nutrition/weekly-plan
// Body: { profile, schedule, weeklyLoad }
// schedule: { "2025-05-12": "cardio", "2025-05-13": "strength", ... }
router.post('/weekly-plan', (req: Request, res: Response) => {
  const { profile, schedule, weeklyLoad } = req.body as {
    profile: UserProfile;
    schedule: Record<string, DailyLog['trainingType']>;
    weeklyLoad: WeeklyLoad;
  };

  if (!profile || !schedule || !weeklyLoad) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const plan = generateWeeklyPlan(profile, schedule, weeklyLoad);
  return res.json(plan);
});

// GET /api/nutrition/periodization
// Query: goalDeadline, today, goalType
router.get('/periodization', (req: Request, res: Response) => {
  const { goalDeadline, today, goalType } = req.query as {
    goalDeadline: string;
    today: string;
    goalType: 'run' | 'lift';
  };

  if (!goalDeadline || !today || !goalType) {
    return res.status(400).json({ error: 'Missing goalDeadline, today, or goalType' });
  }

  const result = getPeriodizationPhase(goalDeadline, today, goalType);
  return res.json(result);
});

export default router;
