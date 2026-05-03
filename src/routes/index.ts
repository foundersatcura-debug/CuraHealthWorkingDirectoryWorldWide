/**
 * API Router – All routes with RBAC guards
 */

import { Router } from 'express';
import { authenticate, loadPermissions, requirePermission } from '../middleware/rbac.middleware';

// Controllers
import * as nurseCtrl from '../controllers/nurse.controller';
import * as adminCtrl from '../controllers/admin.controller';
import * as receptionCtrl from '../controllers/reception.controller';

const router = Router();

// ─── Apply Auth Middleware to all routes ──────────────────────────────────────
router.use(authenticate);
router.use(loadPermissions);

// ══════════════════════════════════════════════════════════════════════════════
// NURSE ROUTES
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/nurse/ward-patients – Ward patients list for today's shift */
router.get(
  '/nurse/ward-patients',
  requirePermission('ipd', 'read'),
  nurseCtrl.getWardPatients,
);

/** POST /api/nurse/vitals – Record patient vitals */
router.post(
  '/nurse/vitals',
  requirePermission('vitals', 'write'),
  nurseCtrl.recordVitals,
);

/** GET /api/nurse/vitals/:patientId – Get vitals history */
router.get(
  '/nurse/vitals/:patientId',
  requirePermission('vitals', 'read'),
  nurseCtrl.getVitalsHistory,
);

/** GET /api/nurse/prescriptions/:patientId – Active prescriptions with admin logs */
router.get(
  '/nurse/prescriptions/:patientId',
  requirePermission('prescriptions', 'read'),
  nurseCtrl.getActivePrescriptions,
);

/** POST /api/nurse/medication-admin – Log medication given */
router.post(
  '/nurse/medication-admin',
  requirePermission('medications', 'write'),
  nurseCtrl.logMedicationAdmin,
);

/** GET /api/nurse/queue – Active OPD/ward queue for this branch */
router.get(
  '/nurse/queue',
  requirePermission('opd', 'read'),
  nurseCtrl.getNurseQueue,
);

/** PUT /api/nurse/queue/:queueId/vitals-done – Mark vitals done */
router.put(
  '/nurse/queue/:queueId/vitals-done',
  requirePermission('vitals', 'write'),
  nurseCtrl.markVitalsDone,
);

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/admin/metrics – Branch metrics (multi-tenant) */
router.get(
  '/admin/metrics',
  requirePermission('reports', 'read'),
  adminCtrl.getBranchMetrics,
);

/** GET /api/admin/users – User list with role info */
router.get(
  '/admin/users',
  requirePermission('users', 'read'),
  adminCtrl.getUsers,
);

/** POST /api/admin/users – Create new user */
router.post(
  '/admin/users',
  requirePermission('users', 'write'),
  adminCtrl.createUser,
);

/** PUT /api/admin/users/:userId – Update user */
router.put(
  '/admin/users/:userId',
  requirePermission('users', 'write'),
  adminCtrl.updateUser,
);

/** GET /api/admin/roles – List all roles with permissions */
router.get(
  '/admin/roles',
  requirePermission('users', 'read'),
  adminCtrl.getRoles,
);

/** PUT /api/admin/roles/:roleId/permissions – Update role permissions */
router.put(
  '/admin/roles/:roleId/permissions',
  requirePermission('users', 'write'),
  adminCtrl.updateRolePermissions,
);

/** GET /api/admin/audit-logs – Compliance audit trail */
router.get(
  '/admin/audit-logs',
  requirePermission('audit', 'read'),
  adminCtrl.getAuditLogs,
);

/** GET /api/admin/financial – Financial summary */
router.get(
  '/admin/financial',
  requirePermission('billing', 'read'),
  adminCtrl.getFinancialSummary,
);

// ══════════════════════════════════════════════════════════════════════════════
// RECEPTION ROUTES
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/reception/queue – Full OPD queue */
router.get(
  '/reception/queue',
  requirePermission('opd', 'read'),
  receptionCtrl.getOPDQueue,
);

/** POST /api/reception/queue – Add patient to queue / issue token */
router.post(
  '/reception/queue',
  requirePermission('opd', 'write'),
  receptionCtrl.addToQueue,
);

/** PUT /api/reception/queue/:queueId – Update queue status */
router.put(
  '/reception/queue/:queueId',
  requirePermission('opd', 'write'),
  receptionCtrl.updateQueueStatus,
);

/** POST /api/reception/patients – Register new patient */
router.post(
  '/reception/patients',
  requirePermission('patients', 'write'),
  receptionCtrl.registerPatient,
);

/** GET /api/reception/beds – Bed availability by ward */
router.get(
  '/reception/beds',
  requirePermission('ipd', 'read'),
  receptionCtrl.getBedAvailability,
);

/** GET /api/reception/appointments/today – Today's appointments */
router.get(
  '/reception/appointments/today',
  requirePermission('appointments', 'read'),
  receptionCtrl.getTodayAppointments,
);

/** POST /api/reception/invoices – Create counter invoice */
router.post(
  '/reception/invoices',
  requirePermission('billing', 'write'),
  receptionCtrl.createInvoice,
);

/** POST /api/reception/payments – Record payment */
router.post(
  '/reception/payments',
  requirePermission('billing', 'write'),
  receptionCtrl.recordPayment,
);

export default router;
