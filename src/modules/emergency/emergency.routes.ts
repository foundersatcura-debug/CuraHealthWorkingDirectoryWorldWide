import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './emergency.controller';

const router = Router();
router.use(authenticate);

router.get('/',        authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'), controller.list);
router.post('/',       authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'), controller.create);
router.get('/:id',     controller.getOne);
router.put('/:id',     authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE'), controller.update);
router.patch('/:id/status', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE'), controller.updateStatus);

export { router as emergencyRouter };
