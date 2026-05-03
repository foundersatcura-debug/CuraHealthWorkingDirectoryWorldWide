import { Router } from 'express';
import { optionalAuthenticate } from '../../middleware/auth';
import * as controller from './b2c.controller';

const router = Router();

// Public routes — no auth required
router.get('/hospitals',              controller.listHospitals);
router.get('/hospitals/:id',          controller.getHospital);
router.get('/hospitals/:id/doctors',  controller.getHospitalDoctors);
router.get('/hospitals/:id/departments', controller.getHospitalDepartments);

// Doctor slots availability
router.get('/doctors/:id/slots', controller.getDoctorSlots);

// Queue (public display)
router.get('/queue/:doctorId', controller.liveQueue);

// Routes requiring patient auth (handled separately via patientAuth middleware)
router.use(optionalAuthenticate);
router.post('/appointments', controller.bookAppointment);
router.get('/my/appointments', controller.myAppointments);
router.get('/my/records', controller.myRecords);
router.get('/my/bills', controller.myBills);

export { router as b2cRouter };
