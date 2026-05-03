import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './labCatalog.controller';

const router = Router();
router.use(authenticate);

// Lab tests
router.get('/tests',                 controller.listTests);
router.post('/tests',                authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'LAB_TECHNICIAN'), controller.createTest);
router.get('/tests/:id',             controller.getTest);
router.put('/tests/:id',             authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'LAB_TECHNICIAN'), controller.updateTest);
router.delete('/tests/:id',          authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.deleteTest);

// Lab parameters
router.get('/parameters',            controller.listParameters);
router.post('/parameters',           authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'LAB_TECHNICIAN'), controller.createParameter);
router.put('/parameters/:id',        authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'LAB_TECHNICIAN'), controller.updateParameter);
router.delete('/parameters/:id',     authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.deleteParameter);

export { router as labCatalogRouter };
