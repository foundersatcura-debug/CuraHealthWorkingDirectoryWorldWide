import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess, sendCreated, sendNotFound } from '../../utils/response';
import { hashPassword } from '../../utils/password';
import { getPagination, buildMeta } from '../../utils/pagination';
import { AuthenticatedRequest } from '../../types';
import { AppError } from '../../middleware/errorHandler';

export async function list(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { page, limit, skip } = getPagination(req);
  const search = req.query.search as string | undefined;
  const dept_id = req.query.dept_id as string | undefined;

  const where = {
    user: { branch_id: user.branch_id, is_active: true },
    ...(dept_id ? { dept_id } : {}),
    ...(search ? { OR: [
      { specialization: { contains: search, mode: 'insensitive' as const } },
      { user: { first_name: { contains: search, mode: 'insensitive' as const } } },
      { user: { last_name: { contains: search, mode: 'insensitive' as const } } },
    ]} : {}),
  };

  const [doctors, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      skip,
      take: limit,
      include: {
        user: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, avatar_url: true } },
        department: { select: { id: true, name: true } },
      },
    }),
    prisma.doctor.count({ where }),
  ]);

  sendSuccess(res, doctors, buildMeta(page, limit, total));
}

export async function listAvailable(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const dept_id = req.query.dept_id as string | undefined;

  const doctors = await prisma.doctor.findMany({
    where: { user: { branch_id: user.branch_id, is_active: true }, is_available: true, ...(dept_id ? { dept_id } : {}) },
    include: {
      user: { select: { first_name: true, last_name: true, avatar_url: true } },
      department: { select: { id: true, name: true } },
    },
  });

  sendSuccess(res, doctors);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, avatar_url: true } },
      department: true,
    },
  });
  if (!doctor) { sendNotFound(res, 'Doctor'); return; }
  sendSuccess(res, doctor);
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const { first_name, last_name, email, phone, password, specialization, qualification,
          experience_years, license_no, consultation_fee, dept_id, schedule } = req.body as Record<string, string>;

  const hashedPassword = await hashPassword(password ?? 'Doctor@123');

  const newUser = await prisma.user.create({
    data: {
      branch_id: user.branch_id,
      email,
      password: hashedPassword,
      role: 'DOCTOR',
      first_name,
      last_name,
      phone,
      doctor: {
        create: {
          specialization,
          qualification,
          experience_years: Number(experience_years) || 0,
          license_no,
          consultation_fee: Number(consultation_fee) || 0,
          dept_id: dept_id || null,
          schedule: schedule ?? null,
        },
      },
    },
    include: { doctor: true },
  });

  sendCreated(res, newUser);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { first_name, last_name, phone, specialization, qualification, experience_years,
          consultation_fee, dept_id, is_available, schedule } = req.body as Record<string, string>;

  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor) throw new AppError('Doctor not found', 404);

  await Promise.all([
    prisma.user.update({
      where: { id: doctor.user_id },
      data: { ...(first_name ? { first_name } : {}), ...(last_name ? { last_name } : {}), ...(phone ? { phone } : {}) },
    }),
    prisma.doctor.update({
      where: { id: req.params.id },
      data: {
        ...(specialization ? { specialization } : {}),
        ...(qualification ? { qualification } : {}),
        ...(experience_years ? { experience_years: Number(experience_years) } : {}),
        ...(consultation_fee ? { consultation_fee: Number(consultation_fee) } : {}),
        ...(dept_id !== undefined ? { dept_id } : {}),
        ...(is_available !== undefined ? { is_available: is_available === 'true' } : {}),
        ...(schedule ? { schedule } : {}),
      },
    }),
  ]);

  const updated = await prisma.doctor.findUnique({ where: { id: req.params.id }, include: { user: true } });
  sendSuccess(res, updated);
}

export async function toggleAvailability(req: Request, res: Response): Promise<void> {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor) throw new AppError('Doctor not found', 404);

  const updated = await prisma.doctor.update({
    where: { id: req.params.id },
    data: { is_available: !doctor.is_available },
  });
  sendSuccess(res, { id: updated.id, is_available: updated.is_available });
}

export async function getSchedule(req: Request, res: Response): Promise<void> {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id }, select: { schedule: true } });
  if (!doctor) { sendNotFound(res, 'Doctor'); return; }
  sendSuccess(res, { schedule: doctor.schedule });
}

export async function updateSchedule(req: Request, res: Response): Promise<void> {
  const doctor = await prisma.doctor.update({
    where: { id: req.params.id },
    data: { schedule: req.body.schedule },
    select: { id: true, schedule: true },
  });
  sendSuccess(res, doctor);
}
