import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './analytics.controller';

const router = Router();
router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'FOUNDER'));

router.get('/dashboard',    controller.dashboardSummary);
router.get('/revenue',      controller.revenue);
router.get('/appointments', controller.appointmentStats);
router.get('/occupancy',    controller.occupancyStats);
router.get('/patients',     controller.patientStats);

export { router as analyticsRouter };
