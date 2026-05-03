import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './doctors.controller';

const router = Router();
router.use(authenticate);

router.get('/',           authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'), controller.list);
router.post('/',          authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.create);
router.get('/available',  controller.listAvailable);
router.get('/:id',        controller.getOne);
router.put('/:id',        authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.update);
router.patch('/:id/availability', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.toggleAvailability);
router.get('/:id/schedule', controller.getSchedule);
router.put('/:id/schedule', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.updateSchedule);

export { router as doctorsRouter };
