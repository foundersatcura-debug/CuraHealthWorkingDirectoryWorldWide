/**
 * Admin (System) Controller
 * Handles: branch metrics, user management, RBAC, audit logs, financial
 */

import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Branch, User, Role, Invoice, Payment, AuditLog, Admission, Bed, PatientQueue } from '../entities';
import bcrypt from 'bcrypt';
import { logAudit } from '../middleware/rbac.middleware';

// ─── GET /api/admin/metrics ───────────────────────────────────────────────────
// Multi-tenant: returns metrics for a given branch (or all if no branchId)

export async function getBranchMetrics(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id: reqBranchId } = req.query;
    const { branch_id: userBranchId, role_type } = req.user!;

    // Non-super-admin can only see their own branch
    const targetBranchId = role_type === 'super_admin' ? reqBranchId : userBranchId;

    const today = new Date().toISOString().split('T')[0];

    const [
      bedStats,
      admissionToday,
      revenueToday,
      queueStats,
    ] = await Promise.all([
      // Bed occupancy
      AppDataSource.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'available') AS available_beds,
          COUNT(*) FILTER (WHERE status = 'occupied')  AS occupied_beds,
          COUNT(*)                                     AS total_beds
        FROM beds b
        JOIN wards w ON w.ward_id = b.ward_id
        WHERE w.branch_id = $1 AND w.is_active = true
      `, [targetBranchId]),

      // Patients admitted today + total active admissions
      AppDataSource.query(`
        SELECT COUNT(*) AS patients_today
        FROM admissions
        WHERE branch_id = $1
          AND admit_date::date = $2
          AND status NOT IN ('discharged','transferred')
      `, [targetBranchId, today]),

      // Revenue today (sum of paid invoices)
      AppDataSource.query(`
        SELECT
          COALESCE(SUM(total), 0)       AS revenue_today,
          COUNT(*)                       AS invoices_raised,
          COUNT(*) FILTER (WHERE status = 'paid') AS invoices_paid
        FROM invoices
        WHERE branch_id = $1
          AND created_at::date = $2
      `, [targetBranchId, today]),

      // OPD queue stats
      AppDataSource.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('waiting','vitals_check')) AS opd_waiting,
          COUNT(*) FILTER (WHERE status = 'completed')                 AS completed_today
        FROM patient_queue
        WHERE branch_id = $1
          AND registered_at::date = $2
      `, [targetBranchId, today]),
    ]);

    const beds = bedStats[0] ?? {};
    const occ = parseInt(beds.occupied_beds ?? '0');
    const total = parseInt(beds.total_beds ?? '1');

    res.json({
      success: true,
      data: {
        branch_id: targetBranchId,
        occupied_beds: occ,
        available_beds: parseInt(beds.available_beds ?? '0'),
        total_beds: total,
        occupancy_rate: total > 0 ? parseFloat(((occ / total) * 100).toFixed(2)) : 0,
        patients_today: parseInt(admissionToday[0]?.patients_today ?? '0'),
        revenue_today: parseFloat(revenueToday[0]?.revenue_today ?? '0'),
        invoices_raised: parseInt(revenueToday[0]?.invoices_raised ?? '0'),
        invoices_paid: parseInt(revenueToday[0]?.invoices_paid ?? '0'),
        opd_waiting: parseInt(queueStats[0]?.opd_waiting ?? '0'),
      },
    });
  } catch (err) {
    console.error('[getBranchMetrics]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch metrics' });
  }
}

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

export async function getUsers(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id, role_type } = req.user!;
    const { branchId, roleType, search, page = '1', limit = '50' } = req.query;

    const repo = AppDataSource.getRepository(User);
    const query = repo.createQueryBuilder('u')
      .leftJoinAndSelect('roles', 'r', 'r.role_id = u.role_id')
      .select([
        'u.user_id', 'u.full_name', 'u.email', 'u.phone',
        'u.role_id', 'r.name AS role_name', 'r.role_type',
        'u.dept_id', 'u.branch_id', 'u.is_active', 'u.last_login', 'u.created_at',
      ]);

    // Non-super-admin can only see users in their own branch
    if (role_type !== 'super_admin') {
      query.where('u.branch_id = :branch_id', { branch_id });
    } else if (branchId) {
      query.where('u.branch_id = :branchId', { branchId });
    }

    if (roleType) query.andWhere('r.role_type = :roleType', { roleType });

    if (search) {
      query.andWhere('(u.full_name ILIKE :s OR u.email ILIKE :s)', { s: `%${search}%` });
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    query.skip(offset).take(parseInt(limit as string));

    const [users, total] = await query.getManyAndCount();

    // Never return password hashes
    res.json({
      success: true,
      data: users,
      meta: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total_pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
}

// ─── POST /api/admin/users ────────────────────────────────────────────────────

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const { full_name, email, phone, role_id, dept_id, branch_id: targetBranch, password } = req.body;

    if (!full_name || !email || !role_id || !password) {
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }

    const repo = AppDataSource.getRepository(User);

    // Check for duplicate email
    const existing = await repo.findOneBy({ email: email.toLowerCase().trim() });
    if (existing) {
      res.status(409).json({ success: false, message: 'Email already registered' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);

    const user = repo.create({
      full_name,
      email: email.toLowerCase().trim(),
      phone,
      role_id,
      dept_id,
      branch_id: targetBranch ?? req.user!.branch_id,
      password_hash,
      is_active: true,
    });

    await repo.save(user);

    await logAudit(req, 'CREATE', 'users', user.user_id,
      `Created user account: ${full_name} (${email})`, 'success', 'medium');

    // Don't return password hash
    const { password_hash: _pw, ...safeUser } = user as Record<string, unknown>;
    res.status(201).json({ success: true, data: safeUser });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
}

// ─── PUT /api/admin/users/:userId ─────────────────────────────────────────────

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { full_name, phone, role_id, dept_id, is_active } = req.body;

    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOneBy({ user_id: userId });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Prevent deactivating super_admin
    const roleRepo = AppDataSource.getRepository(Role);
    const role = await roleRepo.findOneBy({ role_id: user.role_id });
    if (role?.role_type === 'super_admin' && is_active === false) {
      res.status(400).json({ success: false, message: 'Cannot deactivate super admin accounts' });
      return;
    }

    await repo.update(userId, { full_name, phone, role_id, dept_id, is_active });

    await logAudit(req, 'UPDATE', 'users', userId,
      `Updated user: ${user.full_name}${is_active === false ? ' — DEACTIVATED' : ''}`,
      'success', is_active === false ? 'high' : 'low');

    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
}

// ─── GET /api/admin/roles ─────────────────────────────────────────────────────

export async function getRoles(req: Request, res: Response): Promise<void> {
  try {
    const roles = await AppDataSource.getRepository(Role).find();

    // Attach user count per role
    const counts = await AppDataSource.query(`
      SELECT role_id, COUNT(*) AS user_count
      FROM users
      WHERE is_active = true
      GROUP BY role_id
    `);
    const countMap = Object.fromEntries(counts.map((c: { role_id: string; user_count: string }) => [c.role_id, parseInt(c.user_count)]));

    const result = roles.map((r) => ({ ...r, user_count: countMap[r.role_id] ?? 0 }));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch roles' });
  }
}

// ─── PUT /api/admin/roles/:roleId/permissions ─────────────────────────────────

export async function updateRolePermissions(req: Request, res: Response): Promise<void> {
  try {
    const { roleId } = req.params;
    const { permissions } = req.body;

    const repo = AppDataSource.getRepository(Role);
    const role = await repo.findOneBy({ role_id: roleId });

    if (!role) {
      res.status(404).json({ success: false, message: 'Role not found' });
      return;
    }

    if (role.role_type === 'super_admin') {
      res.status(400).json({ success: false, message: 'Super admin permissions cannot be modified' });
      return;
    }

    await repo.update(roleId, { permissions });

    await logAudit(req, 'UPDATE', 'roles', roleId,
      `Updated permissions for role: ${role.name}`, 'success', 'high');

    res.json({ success: true, message: 'Permissions updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update permissions' });
  }
}

// ─── GET /api/admin/audit-logs ────────────────────────────────────────────────

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id, role_type } = req.user!;
    const { severity, action, search, from, to, page = '1', limit = '50' } = req.query;

    const repo = AppDataSource.getRepository(AuditLog);
    const query = repo.createQueryBuilder('l')
      .leftJoin('users', 'u', 'u.user_id = l.user_id')
      .addSelect(['u.full_name AS user_name', 'u.role_id'])
      .orderBy('l.timestamp', 'DESC');

    if (role_type !== 'super_admin') {
      query.where('l.branch_id = :branch_id', { branch_id });
    }

    if (severity && severity !== 'all') query.andWhere('l.severity = :severity', { severity });
    if (action && action !== 'all') query.andWhere('l.action = :action', { action });
    if (search) {
      query.andWhere('(l.description ILIKE :s OR u.full_name ILIKE :s OR l.resource ILIKE :s)', { s: `%${search}%` });
    }
    if (from) query.andWhere('l.timestamp >= :from', { from });
    if (to) query.andWhere('l.timestamp <= :to', { to });

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [logs, total] = await query.skip(offset).take(parseInt(limit as string)).getManyAndCount();

    res.json({
      success: true,
      data: logs,
      meta: { total, page: parseInt(page as string), limit: parseInt(limit as string) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
  }
}

// ─── GET /api/admin/financial ─────────────────────────────────────────────────

export async function getFinancialSummary(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id: reqBranchId, date } = req.query;
    const { branch_id: userBranchId, role_type } = req.user!;

    const targetBranch = role_type === 'super_admin' ? reqBranchId : userBranchId;
    const targetDate = (date as string) ?? new Date().toISOString().split('T')[0];

    const [invoiceStats, paymentStats] = await Promise.all([
      AppDataSource.query(`
        SELECT
          COALESCE(SUM(total), 0)                                     AS revenue_total,
          COUNT(*)                                                     AS invoices_raised,
          COUNT(*) FILTER (WHERE status = 'paid')                     AS invoices_paid,
          COUNT(*) FILTER (WHERE status IN ('pending','partial'))     AS invoices_pending,
          COALESCE(SUM(total - paid_amount) FILTER (WHERE status IN ('pending','partial')), 0) AS outstanding_total
        FROM invoices
        WHERE branch_id = $1
          AND created_at::date = $2
      `, [targetBranch, targetDate]),

      AppDataSource.query(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cash'),         0) AS collections_cash,
          COALESCE(SUM(amount) FILTER (WHERE payment_method = 'card'),         0) AS collections_card,
          COALESCE(SUM(amount) FILTER (WHERE payment_method = 'insurance'),    0) AS collections_insurance,
          COALESCE(SUM(amount) FILTER (WHERE payment_method = 'upi'),          0) AS collections_upi
        FROM payments
        WHERE branch_id = $1
          AND payment_date::date = $2
      `, [targetBranch, targetDate]),
    ]);

    res.json({
      success: true,
      data: {
        date: targetDate,
        ...invoiceStats[0],
        ...paymentStats[0],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch financial summary' });
  }
}
