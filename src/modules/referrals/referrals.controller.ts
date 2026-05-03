import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const patient_id = req.query.patient_id as string | undefined;
  const referring_doctor_id = req.query.referring_doctor_id as string | undefined;
  const status = req.query.status as string | undefined;
  const referral_type = req.query.referral_type as string | undefined;

  const where = {
    ...(patient_id ? { patient_id } : {}),
    ...(referring_doctor_id ? { referring_doctor_id } : {}),
    ...(status ? { status: status as never } : {}),
    ...(referral_type ? { referral_type: referral_type as never } : {}),
  };

  const [referrals, total] = await Promise.all([
    prisma.referral.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: { select: { id: true, uhid: true, first_name: true, last_name: true } },
        referring_doctor: { select: { id: true, first_name: true, last_name: true, role: true } },
        target_doctor: { select: { id: true, first_name: true, last_name: true, role: true } },
        appointment: { select: { id: true, appointment_date: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.referral.count({ where }),
  ]);

  sendSuccess(res, referrals, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const referral = await prisma.referral.findUnique({
    where: { id: req.params.id },
    include: {
      patient: true,
      referring_doctor: true,
      target_doctor: true,
      appointment: true,
    },
  });
  if (!referral) { sendNotFound(res, 'Referral'); return; }
  sendSuccess(res, referral);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const {
    patient_id, visit_id, referral_type, target_doctor_id,
    target_hospital_name, reason_for_referral, urgency, notes,
  } = req.body as Record<string, string>;

  const referral = await prisma.referral.create({
    data: {
      patient_id,
      visit_id: visit_id || undefined,
      referring_doctor_id: user.id,
      referral_type: (referral_type as never) ?? 'INTERNAL',
      target_doctor_id: target_doctor_id || undefined,
      target_hospital_name: target_hospital_name || undefined,
      reason_for_referral,
      urgency: (urgency as never) ?? 'ROUTINE',
      notes,
    },
    include: {
      patient: { select: { first_name: true, last_name: true, uhid: true } },
      target_doctor: { select: { first_name: true, last_name: true } },
    },
  });

  sendCreated(res, referral);
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const { status, notes } = req.body as { status: string; notes?: string };

  const referral = await prisma.referral.findUnique({ where: { id: req.params.id } });
  if (!referral) throw new AppError('Referral not found', 404);

  const updated = await prisma.referral.update({
    where: { id: req.params.id },
    data: {
      status: status as never,
      ...(notes ? { notes } : {}),
    },
  });

  sendSuccess(res, updated);
}

export async function update(req: Request, res: Response): Promise<void> {
  const referral = await prisma.referral.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  sendSuccess(res, referral);
}
