import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './lab.controller';

const router = Router();
router.use(authenticate);

router.get('/',                          authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'LAB_TECHNICIAN', 'NURSE'), controller.list);
router.post('/',                         authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.create);
router.get('/:id',                       controller.getOne);
router.patch('/:id/status',             authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'LAB_TECHNICIAN'), controller.updateStatus);
router.post('/:id/results',             authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'LAB_TECHNICIAN'), controller.addResults);
router.get('/:id/results',              controller.getResults);

export { router as labRouter };
