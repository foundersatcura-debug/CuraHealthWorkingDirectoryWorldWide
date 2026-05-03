import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './pharmacy.controller';

const router = Router();
router.use(authenticate);

router.get('/medicines',         controller.listMedicines);
router.post('/medicines',        authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.createMedicine);
router.get('/medicines/:id',     controller.getMedicine);
router.put('/medicines/:id',     authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.updateMedicine);
router.patch('/medicines/:id/stock', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.updateStock);

router.get('/dispensing',        authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.listPrescriptionsForDispensing);
router.post('/dispense/:id',     authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.dispensePrescription);

router.get('/low-stock',         authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.lowStock);
router.get('/expiring-soon',     authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.expiringSoon);

export { router as pharmacyRouter };
