import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './ipd.controller';

const router = Router();
router.use(authenticate);

// Wards
router.get('/wards',           controller.listWards);
router.post('/wards',          authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.createWard);
router.get('/wards/:id',       controller.getWard);
router.put('/wards/:id',       authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.updateWard);

// Beds
router.get('/beds',            controller.listBeds);
router.post('/beds',           authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.createBed);
router.patch('/beds/:id/status', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'NURSE'), controller.updateBedStatus);

// Admissions
router.get('/admissions',           authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE'), controller.listAdmissions);
router.post('/admissions',          authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.createAdmission);
router.get('/admissions/:id',       controller.getAdmission);
router.patch('/admissions/:id/discharge', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.discharge);

// Discharge summaries
router.get('/admissions/:id/discharge-summary',  controller.getDischargeSummary);
router.put('/admissions/:id/discharge-summary',  authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.upsertDischargeSummary);

// Clinical notes
router.get('/admissions/:id/clinical-notes',     controller.listClinicalNotes);
router.post('/admissions/:id/clinical-notes',    authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE'), controller.addClinicalNote);

export { router as ipdRouter };
