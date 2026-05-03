import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AuthenticatedRequest } from '../../types';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const appointment_id = req.query.appointment_id as string | undefined;
  const admission_id = req.query.admission_id as string | undefined;
  const patient_id = req.query.patient_id as string | undefined;
  const modality = req.query.modality as string | undefined;

  const where = {
    branch_id: user.branch_id,
    ...(appointment_id ? { appointment_id } : {}),
    ...(admission_id ? { admission_id } : {}),
    ...(patient_id ? { patient_id } : {}),
    ...(modality ? { modality: modality as never } : {}),
  };

  const [reports, total] = await Promise.all([
    prisma.radiologyReport.findMany({
      where,
      skip,
      take: limit,
      include: {
        appointment: { include: { patient: { select: { first_name: true, last_name: true, uhid: true } } } },
        admission: { include: { patient: { select: { first_name: true, last_name: true, uhid: true } } } },
      },
      orderBy: { report_date: 'desc' },
    }),
    prisma.radiologyReport.count({ where }),
  ]);

  sendSuccess(res, reports, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const report = await prisma.radiologyReport.findUnique({
    where: { id: req.params.id },
    include: {
      appointment: { include: { patient: true } },
      admission: { include: { patient: true } },
    },
  });
  if (!report) { sendNotFound(res, 'Radiology report'); return; }
  sendSuccess(res, report);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const {
    patient_id, appointment_id, admission_id,
    modality, body_part, clinical_info,
    findings, impression, image_url,
  } = req.body as Record<string, string>;

  const report = await prisma.radiologyReport.create({
    data: {
      patient_id: patient_id || undefined,
      appointment_id: appointment_id || undefined,
      admission_id: admission_id || undefined,
      branch_id: user.branch_id,
      ordered_by: user.id,
      modality: (modality as never) ?? 'XRAY',
      body_part,
      clinical_info,
      findings,
      impression,
      image_url,
      reported_by: user.id,
    },
  });

  sendCreated(res, report);
}

export async function update(req: Request, res: Response): Promise<void> {
  const report = await prisma.radiologyReport.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  sendSuccess(res, report);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await prisma.radiologyReport.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Report deleted' });
}
