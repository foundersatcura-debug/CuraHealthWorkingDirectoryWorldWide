import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, subDays } from 'date-fns';

export async function dashboardSummary(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const branchId = user.branch_id;
  const today = new Date();

  const [
    totalPatients, newPatientsToday, totalDoctors,
    appointmentsToday, appointmentsCompleted,
    pendingBills, totalRevenue,
    activeAdmissions, availableBeds,
    emergencyActive,
  ] = await Promise.all([
    prisma.patient.count({ where: { branch_id: branchId ?? '', is_active: true } }),
    prisma.patient.count({ where: { branch_id: branchId ?? '', registered_at: { gte: startOfDay(today), lte: endOfDay(today) } } }),
    prisma.doctor.count({ where: { user: { branch_id: branchId ?? '', is_active: true } } }),
    prisma.appointment.count({ where: { branch_id: branchId, appointment_date: { gte: startOfDay(today), lte: endOfDay(today) } } }),
    prisma.appointment.count({ where: { branch_id: branchId, appointment_date: { gte: startOfDay(today), lte: endOfDay(today) }, status: 'COMPLETED' } }),
    prisma.bill.count({ where: { branch_id: branchId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } }),
    prisma.payment.aggregate({ where: { bill: { branch_id: branchId } }, _sum: { amount: true } }),
    prisma.admission.count({ where: { patient: { branch_id: branchId ?? '' }, status: 'ADMITTED' } }),
    prisma.bed.count({ where: { ward: { branch_id: branchId ?? '' }, status: 'AVAILABLE' } }),
    prisma.emergencyCase.count({ where: { branch_id: branchId, status: { in: ['WAITING', 'BEING_TREATED'] } } }),
  ]);

  sendSuccess(res, {
    patients: { total: totalPatients, new_today: newPatientsToday },
    doctors: { total: totalDoctors },
    appointments: { today: appointmentsToday, completed: appointmentsCompleted },
    billing: { pending_bills: pendingBills, total_revenue: totalRevenue._sum.amount ?? 0 },
    ipd: { active_admissions: activeAdmissions, available_beds: availableBeds },
    emergency: { active_cases: emergencyActive },
  });
}

export async function revenue(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const branchId = user.branch_id;
  const period = req.query.period as string ?? 'month';

  const today = new Date();
  const start = period === 'month' ? startOfMonth(today) : subDays(today, 7);
  const end = endOfMonth(today);

  const payments = await prisma.payment.findMany({
    where: { bill: { branch_id: branchId }, payment_date: { gte: start, lte: end } },
    select: { amount: true, method: true, payment_date: true },
    orderBy: { payment_date: 'asc' },
  });

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const byMethod = payments.reduce((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {} as Record<string, number>);

  sendSuccess(res, { total: totalRevenue, by_method: byMethod, payments });
}

export async function appointmentStats(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const today = new Date();

  const [byStatus, byType, byDept] = await Promise.all([
    prisma.appointment.groupBy({
      by: ['status'],
      where: { branch_id: user.branch_id, appointment_date: { gte: startOfMonth(today) } },
      _count: true,
    }),
    prisma.appointment.groupBy({
      by: ['type'],
      where: { branch_id: user.branch_id, appointment_date: { gte: startOfMonth(today) } },
      _count: true,
    }),
    prisma.appointment.groupBy({
      by: ['dept_id'],
      where: { branch_id: user.branch_id, appointment_date: { gte: startOfMonth(today) } },
      _count: true,
    }),
  ]);

  sendSuccess(res, { by_status: byStatus, by_type: byType, by_department: byDept });
}

export async function occupancyStats(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const wards = await prisma.ward.findMany({
    where: { branch_id: user.branch_id ?? '', is_active: true },
    include: {
      _count: { select: { beds: true } },
      beds: { where: { status: 'OCCUPIED' }, select: { id: true } },
    },
  });

  const stats = wards.map(w => ({
    ward_id: w.id,
    ward_name: w.name,
    total_beds: w.total_beds,
    occupied: w.beds.length,
    available: w.total_beds - w.beds.length,
    occupancy_rate: w.total_beds > 0 ? Math.round((w.beds.length / w.total_beds) * 100) : 0,
  }));

  sendSuccess(res, stats);
}

export async function patientStats(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  const today = new Date();

  const [byGender, byBloodGroup, newPerDay] = await Promise.all([
    prisma.patient.groupBy({
      by: ['gender'],
      where: { branch_id: user.branch_id ?? '' },
      _count: true,
    }),
    prisma.patient.groupBy({
      by: ['blood_group'],
      where: { branch_id: user.branch_id ?? '' },
      _count: true,
    }),
    prisma.patient.groupMany
      ? prisma.patient.groupBy({
          by: ['registered_at'],
          where: { branch_id: user.branch_id ?? '', registered_at: { gte: subDays(today, 30) } },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  sendSuccess(res, { by_gender: byGender, by_blood_group: byBloodGroup });
}
