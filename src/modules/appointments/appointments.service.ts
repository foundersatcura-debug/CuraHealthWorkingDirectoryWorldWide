import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { buildMeta } from '../../utils/pagination';
import { generateTokenNumber } from '../../utils/idGenerator';
import { AppError } from '../../middleware/errorHandler';
import { emit } from '../../socket';
import { VALID_STATUS_TRANSITIONS } from '../../types';
import type { CreateAppointmentInput, UpdateStatusInput, AppointmentQuery } from './appointments.schema';

const appointmentSelect = {
  id: true, patient_id: true, doctor_id: true, dept_id: true,
  appointment_date: true, appointment_time: true, type: true, status: true,
  chief_complaint: true, notes: true, token_number: true, cancel_reason: true,
  created_at: true,
  patient: { select: { id: true, uhid: true, first_name: true, last_name: true, phone: true, gender: true } },
  doctor: { select: { id: true, specialization: true, user: { select: { first_name: true, last_name: true } } } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentSelect;

export async function listAppointments(branchId: string, query: AppointmentQuery) {
  const { search, date, status, doctor_id, dept_id, page, limit } = query;
  const skip = (page - 1) * limit;

  const dateFilter = date ? {
    gte: new Date(`${date}T00:00:00.000Z`),
    lte: new Date(`${date}T23:59:59.999Z`),
  } : undefined;

  const where: Prisma.AppointmentWhereInput = {
    ...(doctor_id ? { doctor_id } : { doctor: { user: { branch_id: branchId } } }),
    ...(status ? { status } : {}),
    ...(date ? { appointment_date: dateFilter } : {}),
    ...(dept_id ? { dept_id } : {}),
    ...(search ? {
      OR: [
        { patient: { first_name: { contains: search, mode: 'insensitive' } } },
        { patient: { last_name: { contains: search, mode: 'insensitive' } } },
        { patient: { uhid: { contains: search, mode: 'insensitive' } } },
        { patient: { phone: { contains: search } } },
      ],
    } : {}),
  };

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({ where, skip, take: limit, orderBy: [{ appointment_date: 'asc' }, { token_number: 'asc' }], select: appointmentSelect }),
    prisma.appointment.count({ where }),
  ]);

  return { data: appointments, meta: buildMeta(page, limit, total) };
}

export async function getAppointment(id: string) {
  const appt = await prisma.appointment.findUnique({ where: { id }, select: appointmentSelect });
  if (!appt) throw new AppError('Appointment not found', 404);
  return appt;
}

export async function getAppointmentsByDate(doctorId: string, date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end   = new Date(`${date}T23:59:59.999Z`);

  return prisma.appointment.findMany({
    where: { doctor_id: doctorId, appointment_date: { gte: start, lte: end } },
    orderBy: { token_number: 'asc' },
    select: appointmentSelect,
  });
}

export async function createAppointment(branchId: string, input: CreateAppointmentInput) {
  const [patient, doctor] = await Promise.all([
    prisma.patient.findUnique({ where: { id: input.patient_id } }),
    prisma.doctor.findUnique({ where: { id: input.doctor_id } }),
  ]);

  if (!patient) throw new AppError('Patient not found', 404);
  if (!doctor)  throw new AppError('Doctor not found', 404);

  // Check doctor availability — no double booking same slot
  const existing = await prisma.appointment.findFirst({
    where: {
      doctor_id: input.doctor_id,
      appointment_date: new Date(input.appointment_date),
      appointment_time: input.appointment_time,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
  });
  if (existing) throw new AppError('Time slot already booked', 409);

  const tokenNumber = await generateTokenNumber(input.doctor_id, new Date(input.appointment_date));

  const appointment = await prisma.appointment.create({
    data: {
      branch_id: branchId,
      patient_id: input.patient_id,
      doctor_id: input.doctor_id,
      dept_id: input.dept_id,
      appointment_date: new Date(input.appointment_date),
      appointment_time: input.appointment_time,
      type: input.type,
      status: 'SCHEDULED',
      chief_complaint: input.chief_complaint,
      notes: input.notes,
      token_number: tokenNumber,
    },
    select: appointmentSelect,
  });

  // Broadcast to OPD queue
  emit.queueUpdate(input.doctor_id, input.appointment_date, { action: 'new', appointment });

  return appointment;
}

export async function updateAppointmentStatus(id: string, input: UpdateStatusInput) {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) throw new AppError('Appointment not found', 404);

  const allowed = VALID_STATUS_TRANSITIONS[appt.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw new AppError(`Cannot transition from ${appt.status} to ${input.status}`, 400);
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: input.status,
      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.cancel_reason ? { cancel_reason: input.cancel_reason } : {}),
    },
    select: appointmentSelect,
  });

  const dateStr = updated.appointment_date.toISOString().split('T')[0];
  emit.queueUpdate(updated.doctor_id, dateStr, { action: 'status_update', appointment: updated });

  if (input.status === 'IN_PROGRESS') {
    emit.tokenCalled(updated.doctor_id, dateStr, { token_number: updated.token_number, patient: updated.patient });
  }

  return updated;
}

export async function getQueueStats(doctorId: string, date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end   = new Date(`${date}T23:59:59.999Z`);

  const [waiting, inProgress, completed, total] = await Promise.all([
    prisma.appointment.count({ where: { doctor_id: doctorId, appointment_date: { gte: start, lte: end }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
    prisma.appointment.count({ where: { doctor_id: doctorId, appointment_date: { gte: start, lte: end }, status: 'IN_PROGRESS' } }),
    prisma.appointment.count({ where: { doctor_id: doctorId, appointment_date: { gte: start, lte: end }, status: 'COMPLETED' } }),
    prisma.appointment.count({ where: { doctor_id: doctorId, appointment_date: { gte: start, lte: end }, status: { not: 'CANCELLED' } } }),
  ]);

  return { waiting, in_progress: inProgress, completed, total, date, doctor_id: doctorId };
}
