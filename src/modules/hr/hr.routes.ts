import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './hr.controller';

const router = Router();
router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN'));

router.get('/staff',           controller.listStaff);
router.post('/staff',          controller.createStaff);
router.get('/staff/:id',       controller.getStaff);
router.put('/staff/:id',       controller.updateStaff);
router.patch('/staff/:id/status', controller.toggleStaffStatus);

export { router as hrRouter };
