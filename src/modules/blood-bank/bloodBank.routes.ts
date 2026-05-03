import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './bloodBank.controller';

const router = Router();
router.use(authenticate);

router.get('/inventory',          controller.getInventory);
router.get('/donations',          authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'NURSE'), controller.listDonations);
router.post('/donations',         authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'NURSE'), controller.recordDonation);
router.get('/requests',           authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'NURSE'), controller.listRequests);
router.post('/requests',          authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR'), controller.createRequest);
router.patch('/requests/:id',     authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.updateRequest);

export { router as bloodBankRouter };
