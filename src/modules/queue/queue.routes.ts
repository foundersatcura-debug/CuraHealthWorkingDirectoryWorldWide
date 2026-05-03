import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './queue.controller';

const router = Router();
router.use(authenticate);

router.get('/',                            controller.list);
router.post('/',                           authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'DOCTOR', 'NURSE'), controller.create);
router.get('/doctor/:doctorId',            controller.getDoctorQueue);
router.get('/doctor/:doctorId/stats',      controller.getQueueStats);
router.get('/:id',                         controller.getOne);
router.patch('/:id/status',                authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'), controller.updateStatus);

export { router as queueRouter };
