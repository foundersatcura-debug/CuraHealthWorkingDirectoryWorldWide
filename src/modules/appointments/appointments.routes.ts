import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './appointments.controller';
import {
  createAppointmentSchema,
  updateStatusSchema,
  appointmentQuerySchema,
} from './appointments.schema';

const router = Router();
router.use(authenticate);

router.get('/by-date',    controller.byDate);
router.get('/queue-stats', controller.queueStats);

router.get(
  '/',
  authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  validate(appointmentQuerySchema, 'query'),
  controller.list,
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  validate(createAppointmentSchema),
  controller.create,
);

router.get('/:id', controller.getOne);

router.patch(
  '/:id/status',
  authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  validate(updateStatusSchema),
  controller.updateStatus,
);

// Alias for frontend cancel call: PATCH /appointments/:id/cancel
router.patch(
  '/:id/cancel',
  authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  controller.cancel,
);

export { router as appointmentsRouter };
