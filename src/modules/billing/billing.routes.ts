import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './billing.controller';

const router = Router();

// Webhook (no auth required)
router.post('/webhook', controller.handleWebhook);

router.use(authenticate);

router.get('/',                 authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'), controller.list);
router.post('/',                authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'), controller.create);
router.get('/:id',              controller.getOne);
router.put('/:id',              authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.update);
router.post('/:id/payments',    authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'), controller.recordPayment);
router.get('/:id/payments',     controller.getPayments);
router.post('/:id/refunds',     authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.createRefund);
router.get('/:id/refunds',      controller.listRefunds);

export { router as billingRouter };
