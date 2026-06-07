import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import * as controller from './superadmin.controller';
import * as dashboard from './dashboard.controller';

const router = Router();
router.use(authenticate);
router.use(authorize('FOUNDER', 'SUPER_ADMIN'));

// ── Dashboard Command Center ──────────────────────────────────────────────────
// All accept optional ?hospital_id= to scope to one hospital
router.get('/dashboard/command',            dashboard.commandStats);
router.get('/dashboard/priority-alerts',    dashboard.priorityAlerts);
router.get('/dashboard/live-opd',           dashboard.liveOPD);
router.get('/dashboard/bed-control',        dashboard.bedControl);
router.get('/dashboard/appointment-trend',  dashboard.appointmentTrend);
router.get('/dashboard/revenue-control',    dashboard.revenueControl);
router.get('/dashboard/departments',        dashboard.departmentOverview);

// ── Hospitals management ──────────────────────────────────────────────────────
router.get('/hospitals',              controller.listHospitals);
router.post('/hospitals',             controller.createHospital);
router.get('/hospitals/:id',          controller.getHospital);
router.put('/hospitals/:id',          controller.updateHospital);
router.patch('/hospitals/:id/status', controller.toggleHospitalStatus);

// ── Branches ──────────────────────────────────────────────────────────────────
router.get('/hospitals/:id/branches',  controller.listBranches);
router.post('/hospitals/:id/branches', controller.createBranch);

// ── Platform analytics ────────────────────────────────────────────────────────
router.get('/analytics/overview', controller.platformOverview);
router.get('/analytics/revenue',  controller.platformRevenue);

// ── User management ───────────────────────────────────────────────────────────
router.get('/users',              controller.listAllUsers);
router.post('/users',             controller.createUser);
router.patch('/users/:id/status', controller.toggleUserStatus);
router.patch('/users/:id/role',   controller.changeUserRole);

// ── Subscriptions ─────────────────────────────────────────────────────────────
router.get('/subscriptions',       controller.listSubscriptions);
router.patch('/subscriptions/:id', controller.updateSubscription);

// ── Audit logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs', controller.getAuditLogs);

export { router as superadminRouter };
