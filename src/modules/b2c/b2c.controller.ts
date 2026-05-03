import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AppError } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../types';

export async function listHospitals(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const search = req.query.search as string | undefined;
  const city = req.query.city as string | undefined;

  const hospitals = await prisma.hospital.findMany({
    where: {
      is_active: true,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      ...(city ? { address: { path: ['city'], string_contains: city } } : {}),
    },
    skip,
    take: limit,
    include: {
      branches: {
        where: { is_active: true },
        select: { id: true, name: true, address: true, phone: true },
      },
      subscription: { select: { plan: true } },
    },
  });

  sendSuccess(res, hospitals, buildMeta(page, limit, await prisma.hospital.count({ where: { is_active: true } })));
}

export async function getHospital(req: Request, res: Response): Promise<void> {
  const hospital = await prisma.hospital.findUnique({
    where: { id: req.params.id },
    include: {
      branches: { where: { is_active: true } },
      settings: true,
    },
  });
  if (!hospital) throw new AppError('Hospital not found', 404);
  sendSuccess(res, hospital);
}

export async function getHospitalDoctors(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req);
  const dept_id = req.query.dept_id as string | undefined;

  const [doctors, total] = await Promise.all([
    prisma.doctor.findMany({
      where: {
        user: { branch: { hospital_id: req.params.id }, is_active: true },
        is_available: true,
        ...(dept_id ? { dept_id } : {}),
      },
      skip,
      take: limit,
      select: {
        id: true,
        specialization: true,
        qualification: true,
        experience_years: true,
        consultation_fee: true,
        schedule: true,
        user: { select: { first_name: true, last_name: true, avatar_url: true } },
        department: { select: { name: true } },
      },
    }),
    prisma.doctor.count({
      where: { user: { branch: { hospital_id: req.params.id }, is_active: true }, is_available: true },
    }),
  ]);

  sendSuccess(res, doctors, buildMeta(page, limit, total));
}

export async function getHospitalDepartments(req: Request, res: Response): Promise<void> {
  const departments = await prisma.department.findMany({
    where: { branch: { hospital_id: req.params.id }, is_active: true },
    select: {
      id: true, name: true, description: true, floor: true,
      _count: { select: { doctors: true } },
    },
    orderBy: { name: 'asc' },
  });
  sendSuccess(res, departments);
}

export async function getDoctorSlots(req: Request, res: Response): Promise<void> {
  const { date } = req.query as { date?: string };
  if (!date) throw new AppError('date query param required', 400);

  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id }, select: { schedule: true } });
  if (!doctor) throw new AppError('Doctor not found', 404);

  const bookedSlots = await prisma.appointment.findMany({
    where: {
      doctor_id: req.params.id,
      appointment_date: new Date(date),
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
    select: { appointment_time: true },
  });

  const bookedTimes = new Set(bookedSlots.map(s => s.appointment_time));

  sendSuccess(res, { schedule: doctor.schedule, booked_times: [...bookedTimes], date });
}

export async function liveQueue(req: Request, res: Response): Promise<void> {
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0];

  const queue = await prisma.appointment.findMany({
    where: {
      doctor_id: req.params.doctorId,
      appointment_date: new Date(date),
      status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
    },
    select: {
      id: true,
      token_number: true,
      status: true,
      appointment_time: true,
      patient: { select: { first_name: true } },
    },
    orderBy: { token_number: 'asc' },
  });

  sendSuccess(res, queue);
}

export async function bookAppointment(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { patient_id, doctor_id, appointment_date, appointment_time, chief_complaint, dept_id } =
    req.body as Record<string, string>;

  const existing = await prisma.appointment.findFirst({
    where: { doctor_id, appointment_date: new Date(appointment_date), appointment_time, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
  });
  if (existing) throw new AppError('This slot is already booked', 409);

  const tokenNumber = await prisma.appointment.count({
    where: { doctor_id, appointment_date: new Date(appointment_date), status: { not: 'CANCELLED' } },
  }) + 1;

  const appt = await prisma.appointment.create({
    data: {
      patient_id,
      doctor_id,
      dept_id: dept_id || undefined,
      appointment_date: new Date(appointment_date),
      appointment_time,
      type: 'CONSULTATION',
      status: 'SCHEDULED',
      chief_complaint,
      token_number: tokenNumber,
    },
    include: { doctor: { include: { user: { select: { first_name: true, last_name: true } } } } },
  });

  sendSuccess(res, appt, undefined, 201);
}

export async function myAppointments(req: Request, res: Response): Promise<void> {
  const { patient_id } = req.query as { patient_id?: string };
  if (!patient_id) throw new AppError('patient_id required', 400);

  const appointments = await prisma.appointment.findMany({
    where: { patient_id, status: { not: 'CANCELLED' } },
    include: {
      doctor: {
        include: { user: { select: { first_name: true, last_name: true, avatar_url: true } }, department: true },
      },
    },
    orderBy: { appointment_date: 'desc' },
  });
  sendSuccess(res, appointments);
}

export async function myRecords(req: Request, res: Response): Promise<void> {
  const { patient_id } = req.query as { patient_id?: string };
  if (!patient_id) throw new AppError('patient_id required', 400);

  const records = await prisma.medicalRecord.findMany({
    where: { patient_id },
    include: {
      prescriptions: { include: { items: true } },
      doctor: { include: { user: { select: { first_name: true, last_name: true } } } },
    },
    orderBy: { visit_date: 'desc' },
  });
  sendSuccess(res, records);
}

export async function myBills(req: Request, res: Response): Promise<void> {
  const { patient_id } = req.query as { patient_id?: string };
  if (!patient_id) throw new AppError('patient_id required', 400);

  const bills = await prisma.bill.findMany({
    where: { patient_id },
    include: { items: true, payments: true },
    orderBy: { bill_date: 'desc' },
  });
  sendSuccess(res, bills);
}
