import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { emit } from '../../socket';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';

export async function listWards(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const wards = await prisma.ward.findMany({
    where: { branch_id: user.branch_id ?? '', is_active: true },
    include: { _count: { select: { beds: true } }, department: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  sendSuccess(res, wards);
}

export async function createWard(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const ward = await prisma.ward.create({ data: { branch_id: user.branch_id!, ...req.body as object } });
  sendCreated(res, ward);
}

export async function getWard(req: Request, res: Response): Promise<void> {
  const ward = await prisma.ward.findUnique({
    where: { id: req.params.id },
    include: { beds: { include: { admission: { include: { patient: true } } } } },
  });
  if (!ward) { sendNotFound(res, 'Ward'); return; }
  sendSuccess(res, ward);
}

export async function updateWard(req: Request, res: Response): Promise<void> {
  const ward = await prisma.ward.update({ where: { id: req.params.id }, data: req.body as object });
  sendSuccess(res, ward);
}

export async function listBeds(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const ward_id = req.query.ward_id as string | undefined;
  const status = req.query.status as string | undefined;

  const beds = await prisma.bed.findMany({
    where: {
      ward: { branch_id: user.branch_id ?? '' },
      ...(ward_id ? { ward_id } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      ward: { select: { name: true, type: true } },
      admission: { include: { patient: { select: { first_name: true, last_name: true } } } },
    },
    orderBy: { bed_number: 'asc' },
  });
  sendSuccess(res, beds);
}

export async function createBed(req: Request, res: Response): Promise<void> {
  const bed = await prisma.bed.create({ data: req.body as object });
  sendCreated(res, bed);
}

export async function updateBedStatus(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status: string };
  const bed = await prisma.bed.update({ where: { id: req.params.id }, data: { status: status as never } });
  const ward = await prisma.ward.findUnique({ where: { id: bed.ward_id }, select: { branch_id: true } });
  if (ward) emit.bedStatusChanged(ward.branch_id, bed);
  sendSuccess(res, bed);
}

export async function listAdmissions(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const status = req.query.status as string | undefined;

  const where = {
    patient: { branch_id: user.branch_id ?? '' },
    ...(status ? { status: status as never } : { status: 'ADMITTED' as const }),
  };

  const [admissions, total] = await Promise.all([
    prisma.admission.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: { select: { id: true, uhid: true, first_name: true, last_name: true, phone: true } },
        beds: { select: { id: true, bed_number: true, ward: { select: { name: true } } } },
      },
      orderBy: { admit_date: 'desc' },
    }),
    prisma.admission.count({ where }),
  ]);

  sendSuccess(res, admissions, buildMeta(page, limit, total));
}

export async function createAdmission(req: Request, res: Response): Promise<void> {
  const { patient_id, doctor_id, ward_id, bed_id, admission_type, primary_diagnosis, expected_discharge, diet_type, notes } =
    req.body as Record<string, string>;

  if (bed_id) {
    await prisma.bed.update({ where: { id: bed_id }, data: { status: 'OCCUPIED', patient_id } });
  }

  const admission = await prisma.admission.create({
    data: {
      patient_id,
      doctor_id: doctor_id || undefined,
      ward_id: ward_id || undefined,
      admission_type: (admission_type as never) ?? 'ELECTIVE',
      primary_diagnosis,
      expected_discharge: expected_discharge ? new Date(expected_discharge) : undefined,
      diet_type,
      notes,
      beds: bed_id ? { connect: { id: bed_id } } : undefined,
    },
    include: { patient: true, beds: true },
  });

  sendCreated(res, admission);
}

export async function getAdmission(req: Request, res: Response): Promise<void> {
  const admission = await prisma.admission.findUnique({
    where: { id: req.params.id },
    include: {
      patient: true,
      beds: { include: { ward: true } },
      medical_records: true,
      discharge_summary: true,
      vitals: { orderBy: { recorded_at: 'desc' }, take: 10 },
      clinical_notes: { orderBy: { created_at: 'desc' } },
    },
  });
  if (!admission) { sendNotFound(res, 'Admission'); return; }
  sendSuccess(res, admission);
}

export async function discharge(req: Request, res: Response): Promise<void> {
  const admission = await prisma.admission.findUnique({
    where: { id: req.params.id },
    include: { beds: true },
  });
  if (!admission) throw new AppError('Admission not found', 404);

  for (const bed of admission.beds) {
    await prisma.bed.update({ where: { id: bed.id }, data: { status: 'AVAILABLE', patient_id: null, admission_id: null } });
  }

  const {
    notes, condition_at_discharge, course_in_hospital,
    follow_up_advice, final_diagnosis, discharge_medications, referral_id,
  } = req.body as Record<string, string>;

  const updated = await prisma.admission.update({
    where: { id: req.params.id },
    data: { status: 'DISCHARGED', discharge_date: new Date(), notes },
  });

  if (condition_at_discharge) {
    await prisma.dischargeSummary.upsert({
      where: { admission_id: req.params.id },
      create: {
        admission_id: req.params.id,
        condition_at_discharge: condition_at_discharge as never,
        course_in_hospital,
        follow_up_advice,
        final_diagnosis,
        discharge_medications,
        referral_id: referral_id || undefined,
      },
      update: {
        condition_at_discharge: condition_at_discharge as never,
        course_in_hospital,
        follow_up_advice,
        final_diagnosis,
        discharge_medications,
        referral_id: referral_id || undefined,
      },
    });
  }

  sendSuccess(res, updated);
}

// ─── Discharge Summary ────────────────────────────────────────────────────────

export async function getDischargeSummary(req: Request, res: Response): Promise<void> {
  const summary = await prisma.dischargeSummary.findUnique({
    where: { admission_id: req.params.id },
    include: { referral: true },
  });
  if (!summary) { sendNotFound(res, 'Discharge summary'); return; }
  sendSuccess(res, summary);
}

export async function upsertDischargeSummary(req: Request, res: Response): Promise<void> {
  const summary = await prisma.dischargeSummary.upsert({
    where: { admission_id: req.params.id },
    create: { admission_id: req.params.id, ...req.body as object },
    update: req.body as object,
  });
  sendSuccess(res, summary);
}

// ─── Clinical Notes ───────────────────────────────────────────────────────────

export async function listClinicalNotes(req: Request, res: Response): Promise<void> {
  const notes = await prisma.clinicalNote.findMany({
    where: { admission_id: req.params.id },
    orderBy: { created_at: 'desc' },
  });
  sendSuccess(res, notes);
}

export async function addClinicalNote(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const note = await prisma.clinicalNote.create({
    data: {
      admission_id: req.params.id,
      doctor_id: user.id,
      ...req.body as object,
    },
  });
  sendCreated(res, note);
}
