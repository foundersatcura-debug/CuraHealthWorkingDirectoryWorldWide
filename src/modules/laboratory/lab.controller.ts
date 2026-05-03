import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { emit } from '../../socket';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const status = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const patient_id = req.query.patient_id as string | undefined;

  const where = {
    branch_id: user.branch_id,
    ...(status ? { status: status as never } : {}),
    ...(priority ? { priority: priority as never } : {}),
    ...(patient_id ? { patient_id } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.labOrder.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: { select: { id: true, uhid: true, first_name: true, last_name: true } },
        doctor: { include: { user: { select: { first_name: true, last_name: true } } } },
        tests: true,
        results: true,
      },
      orderBy: { order_date: 'desc' },
    }),
    prisma.labOrder.count({ where }),
  ]);

  sendSuccess(res, orders, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const order = await prisma.labOrder.findUnique({
    where: { id: req.params.id },
    include: { patient: true, doctor: { include: { user: true } }, tests: true, results: true },
  });
  if (!order) { sendNotFound(res, 'Lab order'); return; }
  sendSuccess(res, order);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { patient_id, doctor_id, priority, notes, tests } = req.body as {
    patient_id: string; doctor_id: string; priority?: string; notes?: string;
    tests: Array<{ test_code: string; test_name: string; category?: string; price?: number }>;
  };

  const order = await prisma.labOrder.create({
    data: {
      patient_id,
      doctor_id: doctor_id || user.id,
      branch_id: user.branch_id,
      priority: (priority as never) ?? 'ROUTINE',
      notes,
      tests: { createMany: { data: tests } },
    },
    include: { tests: true },
  });

  sendCreated(res, order);
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const { status, collected_at } = req.body as { status: string; collected_at?: string };
  const order = await prisma.labOrder.update({
    where: { id: req.params.id },
    data: {
      status: status as never,
      ...(collected_at ? { collected_at: new Date(collected_at) } : {}),
    },
  });
  sendSuccess(res, order);
}

export async function addResults(req: Request, res: Response): Promise<void> {
  const orderId = req.params.id;
  const results = req.body.results as Array<{
    test_name: string; result_value?: string; unit?: string;
    reference_range?: string; is_abnormal?: boolean; notes?: string;
  }>;

  const order = await prisma.labOrder.findUnique({ where: { id: orderId }, include: { patient: true } });
  if (!order) throw new AppError('Lab order not found', 404);

  await prisma.labResult.createMany({ data: results.map(r => ({ ...r, order_id: orderId })) });

  await prisma.labOrder.update({ where: { id: orderId }, data: { status: 'COMPLETED' } });

  // Notify patient
  emit.labResultReady(order.patient_id, { order_id: orderId, patient_id: order.patient_id });

  sendSuccess(res, { message: 'Results recorded successfully' });
}

export async function getResults(req: Request, res: Response): Promise<void> {
  const results = await prisma.labResult.findMany({ where: { order_id: req.params.id } });
  sendSuccess(res, results);
}
