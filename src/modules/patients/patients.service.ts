import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { generateUHID } from '../../utils/idGenerator';
import { AppError } from '../../middleware/errorHandler';
import { buildMeta } from '../../utils/pagination';
import type { CreatePatientInput, UpdatePatientInput, PatientQuery } from './patients.schema';

export async function listPatients(branchId: string, query: PatientQuery) {
  const { search, gender, blood_group, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PatientWhereInput = {
    branch_id: branchId,
    is_active: true,
    ...(gender ? { gender } : {}),
    ...(blood_group ? { blood_group } : {}),
    ...(search
      ? {
          OR: [
            { first_name: { contains: search, mode: 'insensitive' } },
            { last_name: { contains: search, mode: 'insensitive' } },
            { uhid: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { registered_at: 'desc' },
      select: {
        id: true, uhid: true, first_name: true, last_name: true,
        dob: true, age: true, gender: true, blood_group: true,
        phone: true, email: true, is_active: true, registered_at: true,
      },
    }),
    prisma.patient.count({ where }),
  ]);

  return { data: patients, meta: buildMeta(page, limit, total) };
}

export async function getPatient(id: string) {
  const cacheKey = `patient:${id}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      appointments: {
        orderBy: { appointment_date: 'desc' },
        take: 5,
        include: { doctor: { include: { user: true } } },
      },
      medical_records: { orderBy: { visit_date: 'desc' }, take: 5 },
      bills: { where: { status: { not: 'PAID' } }, take: 5 },
    },
  });

  if (!patient) throw new AppError('Patient not found', 404);

  await cache.set(cacheKey, patient, 60);
  return patient;
}

export async function createPatient(branchId: string, input: CreatePatientInput) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { code: true },
  });
  if (!branch) throw new AppError('Branch not found', 404);

  const uhid = await generateUHID(branch.code);

  const patient = await prisma.patient.create({
    data: {
      branch_id: branchId,
      uhid,
      first_name: input.first_name,
      last_name: input.last_name,
      dob: input.dob ? new Date(input.dob) : undefined,
      age: input.age,
      gender: input.gender,
      blood_group: input.blood_group ?? 'UNKNOWN',
      phone: input.phone,
      email: input.email || undefined,
      address: input.address ?? Prisma.JsonNull,
      emergency_contact: input.emergency_contact ?? Prisma.JsonNull,
      insurance_id: input.insurance_id,
    },
  });

  return patient;
}

export async function updatePatient(id: string, input: UpdatePatientInput) {
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new AppError('Patient not found', 404);

  const updated = await prisma.patient.update({
    where: { id },
    data: {
      ...(input.first_name ? { first_name: input.first_name } : {}),
      ...(input.last_name ? { last_name: input.last_name } : {}),
      ...(input.dob ? { dob: new Date(input.dob) } : {}),
      ...(input.age !== undefined ? { age: input.age } : {}),
      ...(input.gender ? { gender: input.gender } : {}),
      ...(input.blood_group ? { blood_group: input.blood_group } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.emergency_contact ? { emergency_contact: input.emergency_contact } : {}),
      ...(input.insurance_id !== undefined ? { insurance_id: input.insurance_id } : {}),
    },
  });

  await cache.del(`patient:${id}`);
  return updated;
}

export async function deactivatePatient(id: string): Promise<void> {
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) throw new AppError('Patient not found', 404);

  await prisma.patient.update({ where: { id }, data: { is_active: false } });
  await cache.del(`patient:${id}`);
}

export async function searchPatients(branchId: string, query: string) {
  if (!query || query.length < 2) return [];

  return prisma.patient.findMany({
    where: {
      branch_id: branchId,
      is_active: true,
      OR: [
        { first_name: { contains: query, mode: 'insensitive' } },
        { last_name: { contains: query, mode: 'insensitive' } },
        { uhid: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
      ],
    },
    take: 15,
    select: { id: true, uhid: true, first_name: true, last_name: true, phone: true, gender: true },
  });
}

export async function getPatientTimeline(patientId: string) {
  const [appointments, labOrders, bills] = await Promise.all([
    prisma.appointment.findMany({
      where: { patient_id: patientId },
      orderBy: { appointment_date: 'desc' },
      take: 20,
      include: { doctor: { include: { user: true } }, department: true },
    }),
    prisma.labOrder.findMany({
      where: { patient_id: patientId },
      orderBy: { order_date: 'desc' },
      take: 10,
      include: { tests: true, results: true },
    }),
    prisma.bill.findMany({
      where: { patient_id: patientId },
      orderBy: { bill_date: 'desc' },
      take: 10,
      select: { id: true, bill_number: true, total: true, status: true, bill_date: true },
    }),
  ]);

  return { appointments, lab_orders: labOrders, bills };
}
