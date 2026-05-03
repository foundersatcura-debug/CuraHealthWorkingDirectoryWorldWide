import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AuthenticatedRequest } from '../../types';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const patient_id = req.query.patient_id as string | undefined;
  const appointment_id = req.query.appointment_id as string | undefined;
  const admission_id = req.query.admission_id as string | undefined;

  const where = {
    ...(patient_id ? { patient_id } : {}),
    ...(appointment_id ? { appointment_id } : {}),
    ...(admission_id ? { admission_id } : {}),
  };

  const [vitals, total] = await Promise.all([
    prisma.vitalsHistory.findMany({
      where,
      skip,
      take: limit,
      orderBy: { recorded_at: 'desc' },
    }),
    prisma.vitalsHistory.count({ where }),
  ]);

  sendSuccess(res, vitals, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const record = await prisma.vitalsHistory.findUnique({ where: { id: req.params.id } });
  if (!record) { sendNotFound(res, 'Vitals record'); return; }
  sendSuccess(res, record);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const {
    patient_id, appointment_id, admission_id,
    blood_pressure, heart_rate, temperature, spo2,
    weight, height, bmi,
  } = req.body as Record<string, string | number>;

  const vitals = await prisma.vitalsHistory.create({
    data: {
      patient_id: patient_id as string,
      appointment_id: appointment_id as string | undefined,
      admission_id: admission_id as string | undefined,
      blood_pressure: blood_pressure as string | undefined,
      heart_rate: heart_rate ? Number(heart_rate) : undefined,
      temperature: temperature ? Number(temperature) : undefined,
      spo2: spo2 ? Number(spo2) : undefined,
      weight: weight ? Number(weight) : undefined,
      height: height ? Number(height) : undefined,
      bmi: bmi ? Number(bmi) : undefined,
      recorded_by: user.id,
    },
  });

  sendCreated(res, vitals);
}

export async function update(req: Request, res: Response): Promise<void> {
  const record = await prisma.vitalsHistory.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  sendSuccess(res, record);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await prisma.vitalsHistory.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Vitals record deleted' });
}

export async function getLatestForPatient(req: Request, res: Response): Promise<void> {
  const { patient_id } = req.params;
  const latest = await prisma.vitalsHistory.findFirst({
    where: { patient_id },
    orderBy: { recorded_at: 'desc' },
  });
  if (!latest) { sendNotFound(res, 'Vitals record'); return; }
  sendSuccess(res, latest);
}
