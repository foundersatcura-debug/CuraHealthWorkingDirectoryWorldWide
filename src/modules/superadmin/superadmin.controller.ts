import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { hashPassword } from '../../utils/password';
import { generateHospitalCode } from '../../utils/idGenerator';
import { AppError } from '../../middleware/errorHandler';

export async function listHospitals(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const [hospitals, total] = await Promise.all([
    prisma.hospital.findMany({
      skip,
      take: limit,
      include: {
        subscription: true,
        _count: { select: { branches: true } },
        branches: { select: { _count: { select: { users: true, patients: true } } } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.hospital.count(),
  ]);
  sendSuccess(res, hospitals, buildMeta(page, limit, total));
}

export async function getHospital(req: Request, res: Response): Promise<void> {
  const hospital = await prisma.hospital.findUnique({
    where: { id: req.params.id },
    include: { branches: true, subscription: true, settings: true },
  });
  if (!hospital) throw new AppError('Hospital not found', 404);
  sendSuccess(res, hospital);
}

export async function createHospital(req: Request, res: Response): Promise<void> {
  const { name, phone, email, address, plan = 'BASIC' } = req.body as Record<string, string>;
  const code = generateHospitalCode(name);

  const hospital = await prisma.hospital.create({
    data: {
      name,
      code,
      phone,
      email,
      address,
      subscription: {
        create: { plan: plan as never, billing_cycle: 'MONTHLY' },
      },
      settings: { create: {} },
    },
    include: { subscription: true },
  });

  sendCreated(res, hospital);
}

export async function updateHospital(req: Request, res: Response): Promise<void> {
  const hospital = await prisma.hospital.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  sendSuccess(res, hospital);
}

export async function toggleHospitalStatus(req: Request, res: Response): Promise<void> {
  const hospital = await prisma.hospital.findUnique({ where: { id: req.params.id } });
  if (!hospital) throw new AppError('Hospital not found', 404);
  const updated = await prisma.hospital.update({
    where: { id: req.params.id },
    data: { is_active: !hospital.is_active },
  });
  sendSuccess(res, { id: updated.id, is_active: updated.is_active });
}

export async function listBranches(req: Request, res: Response): Promise<void> {
  const branches = await prisma.branch.findMany({
    where: { hospital_id: req.params.id },
    include: { _count: { select: { users: true, patients: true } } },
    orderBy: { name: 'asc' },
  });
  sendSuccess(res, branches);
}

export async function createBranch(req: Request, res: Response): Promise<void> {
  const branch = await prisma.branch.create({
    data: { hospital_id: req.params.id, ...(req.body as object) },
  });
  sendCreated(res, branch);
}

export async function platformOverview(req: Request, res: Response): Promise<void> {
  const [hospitals, branches, totalPatients, totalUsers, totalAppointments] = await Promise.all([
    prisma.hospital.count({ where: { is_active: true } }),
    prisma.branch.count({ where: { is_active: true } }),
    prisma.patient.count({ where: { is_active: true } }),
    prisma.user.count({ where: { is_active: true } }),
    prisma.appointment.count(),
  ]);

  sendSuccess(res, {
    hospitals: { total: hospitals },
    branches: { total: branches },
    patients: { total: totalPatients },
    users: { total: totalUsers },
    appointments: { total: totalAppointments },
  });
}

export async function platformRevenue(_req: Request, res: Response): Promise<void> {
  const revenue = await prisma.payment.aggregate({ _sum: { amount: true } });
  const byHospital = await prisma.$queryRaw<{ hospital_name: string; total: number }[]>`
    SELECT h.name AS hospital_name, COALESCE(SUM(p.amount), 0) AS total
    FROM hospitals h
    LEFT JOIN branches b ON b.hospital_id = h.id
    LEFT JOIN bills bi ON bi.branch_id = b.id
    LEFT JOIN payments p ON p.bill_id = bi.id
    GROUP BY h.id, h.name
    ORDER BY total DESC
    LIMIT 20
  `;
  sendSuccess(res, { total_revenue: revenue._sum.amount ?? 0, by_hospital: byHospital });
}

export async function listAllUsers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const role = req.query.role as string | undefined;
  const branch_id = req.query.branch_id as string | undefined;

  const where = {
    ...(role ? { role: role as never } : {}),
    ...(branch_id ? { branch_id } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: { id: true, email: true, first_name: true, last_name: true, role: true, is_active: true, last_login: true, branch: { select: { name: true } } },
      orderBy: { created_at: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  sendSuccess(res, users, buildMeta(page, limit, total));
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const { first_name, last_name, email, password, role, branch_id, phone } = req.body as Record<string, string>;
  const hashedPw = await hashPassword(password ?? 'Welcome@123');
  const user = await prisma.user.create({
    data: { first_name, last_name, email, password: hashedPw, role: role as never, branch_id: branch_id || null, phone },
    select: { id: true, email: true, role: true, first_name: true, last_name: true },
  });
  sendCreated(res, user);
}

export async function toggleUserStatus(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new AppError('User not found', 404);
  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { is_active: !user.is_active } });
  sendSuccess(res, { id: updated.id, is_active: updated.is_active });
}

export async function changeUserRole(req: Request, res: Response): Promise<void> {
  const { role } = req.body as { role: string };
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { role: role as never } });
  sendSuccess(res, { id: user.id, role: user.role });
}

export async function listSubscriptions(req: Request, res: Response): Promise<void> {
  const subs = await prisma.subscription.findMany({
    include: { hospital: { select: { name: true, email: true } } },
    orderBy: { created_at: 'desc' },
  });
  sendSuccess(res, subs);
}

export async function updateSubscription(req: Request, res: Response): Promise<void> {
  const sub = await prisma.subscription.update({ where: { id: req.params.id }, data: req.body as object });
  sendSuccess(res, sub);
}

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const branch_id = req.query.branch_id as string | undefined;
  const user_id = req.query.user_id as string | undefined;
  const resource = req.query.resource as string | undefined;

  const where = {
    ...(branch_id ? { branch_id } : {}),
    ...(user_id ? { user_id } : {}),
    ...(resource ? { resource } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      include: { user: { select: { first_name: true, last_name: true, role: true } } },
      orderBy: { created_at: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  sendSuccess(res, logs, buildMeta(page, limit, total));
}
