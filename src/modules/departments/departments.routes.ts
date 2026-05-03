import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './departments.controller';

const router = Router();
router.use(authenticate);

router.get('/',      controller.list);
router.post('/',     authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.create);
router.get('/:id',   controller.getOne);
router.put('/:id',   authorize('SUPER_ADMIN', 'BRANCH_ADMIN'), controller.update);
router.delete('/:id', authorize('SUPER_ADMIN'), controller.remove);

export { router as departmentsRouter };
