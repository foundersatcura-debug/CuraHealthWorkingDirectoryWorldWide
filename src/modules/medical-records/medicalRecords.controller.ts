import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AuthenticatedRequest } from '../../types';
import { AppError } from '../../middleware/errorHandler';

export async function list(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const patient_id = req.query.patient_id as string | undefined;
  const doctor_id = req.query.doctor_id as string | undefined;

  const where = {
    ...(patient_id ? { patient_id } : {}),
    ...(doctor_id ? { doctor_id } : {}),
  };

  const [records, total] = await Promise.all([
    prisma.medicalRecord.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: { select: { id: true, uhid: true, first_name: true, last_name: true } },
        doctor: { include: { user: { select: { first_name: true, last_name: true } } } },
        prescriptions: { select: { id: true, status: true } },
      },
      orderBy: { visit_date: 'desc' },
    }),
    prisma.medicalRecord.count({ where }),
  ]);

  sendSuccess(res, records, buildMeta(page, limit, total));
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: req.params.id },
    include: {
      patient: true,
      doctor: { include: { user: true } },
      prescriptions: { include: { items: { include: { medicine: true } } } },
      appointment: {
        include: {
          vitals: { orderBy: { recorded_at: 'desc' }, take: 5 },
          clinical_notes: { orderBy: { created_at: 'desc' } },
        },
      },
    },
  });
  if (!record) { sendNotFound(res, 'Medical record'); return; }
  sendSuccess(res, record);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const record = await prisma.medicalRecord.create({
    data: {
      doctor_id: user.id,
      ...(req.body as object),
      visit_date: new Date(),
    },
  });
  sendCreated(res, record);
}

export async function update(req: Request, res: Response): Promise<void> {
  const record = await prisma.medicalRecord.update({ where: { id: req.params.id }, data: req.body as object });
  sendSuccess(res, record);
}

export async function listPrescriptions(req: Request, res: Response): Promise<void> {
  const prescriptions = await prisma.prescription.findMany({
    where: { record_id: req.params.id },
    include: { items: { include: { medicine: true } } },
    orderBy: { prescription_date: 'desc' },
  });
  sendSuccess(res, prescriptions);
}

export async function createPrescription(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { patient_id, items, notes } = req.body as {
    patient_id: string;
    items: Array<{
      medicine_id?: string;
      medicine_name: string;
      dosage: string;
      frequency: string;
      duration: string;
      duration_days?: number;
      route?: string;
      instructions?: string;
      quantity?: number;
    }>;
    notes?: string;
  };

  const prescription = await prisma.prescription.create({
    data: {
      patient_id,
      doctor_id: user.id,
      record_id: req.params.id,
      notes,
      items: { createMany: { data: items.map(i => ({ ...i, quantity: i.quantity ?? 1 })) } },
    },
    include: { items: { include: { medicine: true } } },
  });

  sendCreated(res, prescription);
}

// ─── Clinical Notes (per appointment) ────────────────────────────────────────

export async function listClinicalNotes(req: Request, res: Response): Promise<void> {
  const appointment_id = req.params.appointment_id;
  const notes = await prisma.clinicalNote.findMany({
    where: { appointment_id },
    orderBy: { created_at: 'desc' },
  });
  sendSuccess(res, notes);
}

export async function addClinicalNote(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const note = await prisma.clinicalNote.create({
    data: {
      appointment_id: req.params.appointment_id,
      doctor_id: user.id,
      ...req.body as object,
    },
  });
  sendCreated(res, note);
}

// ─── Patient Medical History & Allergies ─────────────────────────────────────

export async function getPatientHistory(req: Request, res: Response): Promise<void> {
  const { patient_id } = req.params;

  const [history, allergies] = await Promise.all([
    prisma.medicalHistory.findMany({
      where: { patient_id, is_active: true },
      orderBy: { created_at: 'desc' },
    }),
    prisma.allergy.findMany({
      where: { patient_id },
      orderBy: { created_at: 'desc' },
    }),
  ]);

  sendSuccess(res, { medical_history: history, allergies });
}

export async function addMedicalHistory(req: Request, res: Response): Promise<void> {
  const { patient_id } = req.params;
  const item = await prisma.medicalHistory.create({
    data: { patient_id, ...req.body as object },
  });
  sendCreated(res, item);
}

export async function updateMedicalHistory(req: Request, res: Response): Promise<void> {
  const item = await prisma.medicalHistory.update({
    where: { id: req.params.id },
    data: req.body as object,
  });
  sendSuccess(res, item);
}

export async function addAllergy(req: Request, res: Response): Promise<void> {
  const { patient_id } = req.params;
  const allergy = await prisma.allergy.create({
    data: { patient_id, ...req.body as object },
  });
  sendCreated(res, allergy);
}

export async function deleteAllergy(req: Request, res: Response): Promise<void> {
  await prisma.allergy.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Allergy record deleted' });
}
