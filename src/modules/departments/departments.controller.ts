import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNoContent, sendNotFound } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';
import { AppError } from '../../middleware/errorHandler';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const departments = await prisma.department.findMany({
    where: { branch_id: user.branch_id ?? '', is_active: true },
    include: {
      head_doctor: { include: { user: { select: { first_name: true, last_name: true } } } },
      _count: { select: { doctors: true, wards: true } },
    },
    orderBy: { name: 'asc' },
  });
  sendSuccess(res, departments);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const dept = await prisma.department.findUnique({
    where: { id: req.params.id },
    include: {
      doctors: { include: { user: true } },
      wards: { include: { _count: { select: { beds: true } } } },
    },
  });
  if (!dept) { sendNotFound(res, 'Department'); return; }
  sendSuccess(res, dept);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const dept = await prisma.department.create({
    data: { branch_id: user.branch_id!, ...req.body },
  });
  sendCreated(res, dept);
}

export async function update(req: Request, res: Response): Promise<void> {
  const dept = await prisma.department.update({ where: { id: req.params.id }, data: req.body as object });
  sendSuccess(res, dept);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept) throw new AppError('Department not found', 404);
  await prisma.department.update({ where: { id: req.params.id }, data: { is_active: false } });
  sendNoContent(res);
}
