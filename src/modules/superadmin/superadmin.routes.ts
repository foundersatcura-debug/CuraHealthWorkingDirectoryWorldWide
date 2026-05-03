import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './superadmin.controller';

const router = Router();
router.use(authenticate);
router.use(authorize('FOUNDER', 'SUPER_ADMIN'));

// Hospitals management
router.get('/hospitals',           controller.listHospitals);
router.post('/hospitals',          controller.createHospital);
router.get('/hospitals/:id',       controller.getHospital);
router.put('/hospitals/:id',       controller.updateHospital);
router.patch('/hospitals/:id/status', controller.toggleHospitalStatus);

// Branches
router.get('/hospitals/:id/branches', controller.listBranches);
router.post('/hospitals/:id/branches', controller.createBranch);

// Platform analytics
router.get('/analytics/overview',  controller.platformOverview);
router.get('/analytics/revenue',   controller.platformRevenue);

// User management (all staff)
router.get('/users',               controller.listAllUsers);
router.post('/users',              controller.createUser);
router.patch('/users/:id/status',  controller.toggleUserStatus);
router.patch('/users/:id/role',    controller.changeUserRole);

// Subscriptions
router.get('/subscriptions',       controller.listSubscriptions);
router.patch('/subscriptions/:id', controller.updateSubscription);

// Audit logs
router.get('/audit-logs',          controller.getAuditLogs);

export { router as superadminRouter };
