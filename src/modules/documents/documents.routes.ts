import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as controller from './documents.controller';

const router = Router();
router.use(authenticate);

router.get('/',                        controller.list);
router.post('/',                       controller.create);
router.get('/patient/:patient_id',     controller.getPatientDocuments);
router.get('/:id',                     controller.getOne);
router.delete('/:id',                  controller.remove);

export { router as documentsRouter };
