import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './insurance.controller';

const router = Router();
router.use(authenticate);

// Providers
router.get('/providers',          controller.listProviders);
router.post('/providers',         authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.createProvider);
router.get('/providers/:id',      controller.getProvider);
router.put('/providers/:id',      authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.updateProvider);

// Claims
router.get('/claims',             authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'), controller.listClaims);
router.post('/claims',            authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'), controller.createClaim);
router.get('/claims/:id',         controller.getClaim);
router.patch('/claims/:id/status', authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.updateClaimStatus);

export { router as insuranceRouter };
