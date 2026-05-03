import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './medicalRecords.controller';

const router = Router();
router.use(authenticate);

router.get('/',          authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE'), controller.list);
router.post('/',         authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.create);
router.get('/:id',       controller.getOne);
router.put('/:id',       authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.update);

// Prescriptions under a record
router.get('/:id/prescriptions',  controller.listPrescriptions);
router.post('/:id/prescriptions', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.createPrescription);

// Clinical notes under an appointment
router.get('/appointments/:appointment_id/clinical-notes',  controller.listClinicalNotes);
router.post('/appointments/:appointment_id/clinical-notes', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE'), controller.addClinicalNote);

// Patient history & allergies
router.get('/patients/:patient_id/history',    controller.getPatientHistory);
router.post('/patients/:patient_id/history',   authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.addMedicalHistory);
router.put('/history/:id',                     authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.updateMedicalHistory);
router.post('/patients/:patient_id/allergies', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE'), controller.addAllergy);
router.delete('/allergies/:id',                authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.deleteAllergy);

export { router as medicalRecordsRouter };
