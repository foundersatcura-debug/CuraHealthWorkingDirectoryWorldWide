import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { hashPassword } from '../../utils/password';
import { AuthenticatedRequest } from '../../types';
import { AppError } from '../../middleware/errorHandler';

export async function listStaff(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const role = req.query.role as string | undefined;

  const where = {
    branch_id: user.branch_id ?? '',
    is_active: true,
    role: { notIn: ['FOUNDER', 'SUPER_ADMIN'] as never[] },
    ...(role ? { role: role as never } : {}),
  };

  const [staff, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: { id: true, first_name: true, last_name: true, email: true, phone: true, role: true, is_active: true, last_login: true },
      orderBy: { first_name: 'asc' },
    }),
    prisma.user.count({ where }),
  ]);

  sendSuccess(res, staff, buildMeta(page, limit, total));
}

export async function getStaff(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, first_name: true, last_name: true, email: true, phone: true, role: true, is_active: true, staff: true },
  });
  if (!user) throw new AppError('Staff not found', 404);
  sendSuccess(res, user);
}

export async function createStaff(req: Request, res: Response): Promise<void> {
  const authUser = (req as AuthenticatedRequest).user;
  const { first_name, last_name, email, phone, role, dept_id, shift, joining_date } = req.body as Record<string, string>;
  const password = await hashPassword('Welcome@123');

  const user = await prisma.user.create({
    data: {
      branch_id: authUser.branch_id,
      email,
      password,
      role: role as never,
      first_name,
      last_name,
      phone,
      staff: {
        create: {
          dept_id: dept_id || undefined,
          shift: shift || undefined,
          joining_date: joining_date ? new Date(joining_date) : undefined,
        },
      },
    },
    select: { id: true, email: true, role: true, first_name: true, last_name: true },
  });

  sendCreated(res, { ...user, default_password: 'Welcome@123' });
}

export async function updateStaff(req: Request, res: Response): Promise<void> {
  const { first_name, last_name, phone, shift, dept_id } = req.body as Record<string, string>;
  await Promise.all([
    prisma.user.update({ where: { id: req.params.id }, data: { first_name, last_name, phone } }),
    prisma.staff.update({
      where: { user_id: req.params.id },
      data: { ...(shift ? { shift } : {}), ...(dept_id ? { dept_id } : {}) },
    }),
  ]);
  const updated = await prisma.user.findUnique({ where: { id: req.params.id }, include: { staff: true } });
  sendSuccess(res, updated);
}

export async function toggleStaffStatus(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new AppError('Staff not found', 404);
  const updated = await prisma.user.update({ where: { id: req.params.id }, data: { is_active: !user.is_active } });
  sendSuccess(res, { id: updated.id, is_active: updated.is_active });
}
