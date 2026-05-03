import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './patients.controller';
import { createPatientSchema, updatePatientSchema, patientQuerySchema } from './patients.schema';

const router = Router();

router.use(authenticate);

router.get('/search', controller.search);

router.get(
  '/',
  authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  validate(patientQuerySchema, 'query'),
  controller.list,
);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  validate(createPatientSchema),
  controller.create,
);

router.get('/:id', controller.getOne);
router.get('/:id/timeline', controller.timeline);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  validate(updatePatientSchema),
  controller.update,
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'BRANCH_ADMIN'),
  controller.remove,
);

export { router as patientsRouter };
