import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './inventory.controller';

const router = Router();
router.use(authenticate);

// Inventory items
router.get('/items',                    controller.listItems);
router.post('/items',                   authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.createItem);
router.get('/items/low-stock',          controller.lowStockItems);
router.get('/items/:id',                controller.getItem);
router.put('/items/:id',                authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.updateItem);

// Item batches
router.get('/batches',                  controller.listBatches);
router.post('/batches',                 authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.createBatch);
router.get('/batches/expiring-soon',    controller.expiringSoon);
router.put('/batches/:id',              authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.updateBatch);
router.patch('/batches/:id/quantity',   authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'PHARMACY'), controller.adjustBatchQuantity);

export { router as inventoryRouter };
