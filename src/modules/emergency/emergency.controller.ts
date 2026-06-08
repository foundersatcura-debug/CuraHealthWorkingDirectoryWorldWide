import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { emit } from '../../socket';
import { AuthenticatedRequest } from '../../types';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const status = req.query.status as string | undefined;
  const triage = req.query.triage as string | undefined;

  const where = {
    branch_id: user.branch_id,
    ...(status ? { status: status as never } : {}),
    ...(triage ? { triage_level: triage as never } : {}),
  };

  const [cases, total] = await Promise.all([
    prisma.emergencyCase.findMany({
      where,
      skip,
      take: limit,
      include: {
        assigned_doctor: { include: { user: { select: { first_name: true, last_name: true } } } },
        patient: { select: { id: true, uhid: true, first_name: true, last_name: true } },
      },
      orderBy: [{ triage_level: 'asc' }, { arrival_time: 'asc' }],
    }),
    prisma.emergencyCase.count({ where }),
  ]);

  sendSuccess(res, cases, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const ec = await prisma.emergencyCase.findUnique({ where: { id: req.params.id }, include: { patient: true, assigned_doctor: { include: { user: true } } } });
  if (!ec) { sendNotFound(res, 'Emergency case'); return; }
  sendSuccess(res, ec);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const ec = await prisma.emergencyCase.create({
    data: {
      branch_id: user.branch_id,
      ...req.body,
    },
    include: { assigned_doctor: { include: { user: true } } },
  });

  emit.emergencyNew(user.branch_id ?? '', ec);
  sendCreated(res, ec);
}

export async function update(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const ec = await prisma.emergencyCase.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  emit.emergencyUpdate(user.branch_id ?? '', ec);
  sendSuccess(res, ec);
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { status, disposition_notes } = req.body as { status: string; disposition_notes?: string };
  const ec = await prisma.emergencyCase.update({
    where: { id: req.params.id },
    data: { status: status as never, disposition_notes },
  });
  emit.emergencyUpdate(user.branch_id ?? '', ec);
  sendSuccess(res, ec);
}
