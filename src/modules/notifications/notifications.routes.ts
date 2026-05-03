import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as controller from './notifications.controller';

const router = Router();
router.use(authenticate);

router.get('/',          controller.list);
router.patch('/:id/read', controller.markRead);
router.patch('/read-all', controller.markAllRead);

export { router as notificationsRouter };
