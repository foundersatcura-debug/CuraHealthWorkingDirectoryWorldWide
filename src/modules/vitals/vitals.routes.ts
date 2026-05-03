import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as controller from './vitals.controller';

const router = Router();
router.use(authenticate);

router.get('/',                              controller.list);
router.post('/',                             controller.create);
router.get('/patient/:patient_id/latest',    controller.getLatestForPatient);
router.get('/:id',                           controller.getOne);
router.put('/:id',                           controller.update);
router.delete('/:id',                        controller.remove);

export { router as vitalsRouter };
