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
  const doctor_id = req.query.doctor_id as string | undefined;
  const status = req.query.status as string | undefined;
  const date = req.query.date as string | undefined;

  const where = {
    branch_id: user.branch_id ?? '',
    ...(doctor_id ? { doctor_id } : {}),
    ...(status ? { status: status as never } : {}),
    ...(date ? {
      check_in_time: {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`),
      },
    } : {}),
  };

  const [queues, total] = await Promise.all([
    prisma.patientQueue.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: { select: { id: true, uhid: true, first_name: true, last_name: true, phone: true } },
        doctor: { include: { user: { select: { first_name: true, last_name: true } } } },
        appointment: { select: { id: true, chief_complaint: true, appointment_time: true } },
      },
      orderBy: [{ priority: 'asc' }, { queue_number: 'asc' }],
    }),
    prisma.patientQueue.count({ where }),
  ]);

  sendSuccess(res, queues, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const queue = await prisma.patientQueue.findUnique({
    where: { id: req.params.id },
    include: {
      patient: true,
      doctor: { include: { user: true } },
      appointment: true,
    },
  });
  if (!queue) { sendNotFound(res, 'Queue entry'); return; }
  sendSuccess(res, queue);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { patient_id, doctor_id, visit_id, priority, notes } = req.body as Record<string, string>;

  // Get next queue number for the doctor today
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);

  const lastQueue = await prisma.patientQueue.findFirst({
    where: {
      doctor_id,
      check_in_time: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { queue_number: 'desc' },
  });

  const queue_number = (lastQueue?.queue_number ?? 0) + 1;

  const queue = await prisma.patientQueue.create({
    data: {
      patient_id,
      doctor_id,
      branch_id: user.branch_id ?? '',
      visit_id: visit_id || undefined,
      queue_number,
      priority: (priority as never) ?? 'NORMAL',
      notes,
    },
    include: {
      patient: { select: { first_name: true, last_name: true, uhid: true } },
      doctor: { include: { user: { select: { first_name: true, last_name: true } } } },
    },
  });

  emit.queueUpdate(doctor_id, today.toISOString().split('T')[0], { action: 'new', queue });
  sendCreated(res, queue);
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { status } = req.body as { status: string };

  const queue = await prisma.patientQueue.findUnique({ where: { id: req.params.id } });
  if (!queue) throw new AppError('Queue entry not found', 404);

  const updateData: Record<string, unknown> = { status: status as never };

  if (status === 'IN_CONSULTATION') {
    updateData.consultation_start_time = new Date();
  } else if (['COMPLETED', 'SKIPPED', 'CANCELLED'].includes(status)) {
    updateData.consultation_end_time = new Date();
  }

  const updated = await prisma.patientQueue.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      patient: { select: { first_name: true, last_name: true } },
    },
  });

  emit.queueUpdate(queue.doctor_id, new Date().toISOString().split('T')[0], {
    action: 'status_update',
    queue: updated,
  });

  sendSuccess(res, updated);
}

export async function getDoctorQueue(req: Request, res: Response): Promise<void> {
  const { doctorId } = req.params;
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0];

  const queue = await prisma.patientQueue.findMany({
    where: {
      doctor_id: doctorId,
      check_in_time: {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`),
      },
      status: { in: ['WAITING', 'IN_CONSULTATION'] },
    },
    include: {
      patient: { select: { id: true, uhid: true, first_name: true, last_name: true } },
    },
    orderBy: [{ priority: 'asc' }, { queue_number: 'asc' }],
  });

  sendSuccess(res, queue);
}

export async function getQueueStats(req: Request, res: Response): Promise<void> {
  const { doctorId } = req.params;
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0];

  const dateFilter = {
    gte: new Date(`${date}T00:00:00.000Z`),
    lte: new Date(`${date}T23:59:59.999Z`),
  };

  const [waiting, inConsultation, completed, total] = await Promise.all([
    prisma.patientQueue.count({ where: { doctor_id: doctorId, check_in_time: dateFilter, status: 'WAITING' } }),
    prisma.patientQueue.count({ where: { doctor_id: doctorId, check_in_time: dateFilter, status: 'IN_CONSULTATION' } }),
    prisma.patientQueue.count({ where: { doctor_id: doctorId, check_in_time: dateFilter, status: 'COMPLETED' } }),
    prisma.patientQueue.count({ where: { doctor_id: doctorId, check_in_time: dateFilter } }),
  ]);

  sendSuccess(res, { waiting, in_consultation: inConsultation, completed, total });
}
