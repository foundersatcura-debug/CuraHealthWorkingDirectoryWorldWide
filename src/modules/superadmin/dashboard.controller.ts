import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

async function getBranchIds(hospitalId?: string): Promise<string[] | undefined> {
  if (!hospitalId) return undefined;
  const rows = await prisma.branch.findMany({
    where: { hospital_id: hospitalId, is_active: true },
    select: { id: true },
  });
  return rows.map(r => r.id);
}

// ── 1. Command Center Stats ───────────────────────────────────────────────────
// GET /superadmin/dashboard/command?hospital_id=xxx

export async function commandStats(req: Request, res: Response): Promise<void> {
  const { start, end } = todayRange();
  const branchIds = await getBranchIds(req.query.hospital_id as string | undefined);

  const bApptWhere  = branchIds ? { branch_id: { in: branchIds } } : {};
  const bLabWhere   = branchIds ? { branch_id: { in: branchIds } } : {};
  const bERWhere    = branchIds ? { branch_id: { in: branchIds } } : {};
  const bBedWhere   = branchIds ? { ward: { branch_id: { in: branchIds } } } : {};
  const bBillWhere  = branchIds ? { bill: { branch_id: { in: branchIds } } } : {};

  const [
    activeER,
    opdToday,
    bedsOccupied,
    bedsTotal,
    labPending,
    revenueToday,
    lowStockRows,
  ] = await Promise.all([
    prisma.emergencyCase.count({
      where: { status: { in: ['WAITING', 'BEING_TREATED'] }, ...bERWhere },
    }),
    prisma.appointment.count({
      where: {
        appointment_date: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        ...bApptWhere,
      },
    }),
    prisma.bed.count({ where: { status: 'OCCUPIED', ...bBedWhere } }),
    prisma.bed.count({ where: bBedWhere }),
    prisma.labOrder.count({
      where: { status: { in: ['ORDERED', 'SAMPLE_COLLECTED', 'PROCESSING'] }, ...bLabWhere },
    }),
    prisma.payment.aggregate({
      where: { payment_status: 'SUCCESS', payment_date: { gte: start, lt: end }, ...bBillWhere },
      _sum: { amount: true },
    }),
    // Raw: medicines where current stock <= reorder level
    branchIds
      ? prisma.$queryRaw<[{ cnt: bigint }]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS cnt FROM medicines
          WHERE is_active = true
            AND stock_quantity <= reorder_level
            AND branch_id = ANY(${branchIds}::text[])`)
      : prisma.$queryRaw<[{ cnt: bigint }]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS cnt FROM medicines
          WHERE is_active = true AND stock_quantity <= reorder_level`),
  ]);

  const lowStock = Number((lowStockRows as [{ cnt: bigint }])[0]?.cnt ?? 0n);

  sendSuccess(res, {
    active_er: activeER,
    opd_today: opdToday,
    beds_occupied: bedsOccupied,
    beds_total: bedsTotal,
    beds_occupancy_pct: bedsTotal > 0 ? +((bedsOccupied / bedsTotal) * 100).toFixed(1) : 0,
    lab_pending: labPending,
    low_stock: lowStock,
    revenue_today: revenueToday._sum.amount ?? 0,
    snapshot_at: new Date().toISOString(),
  });
}

// ── 2. Priority Alerts ────────────────────────────────────────────────────────
// GET /superadmin/dashboard/priority-alerts?hospital_id=xxx

export async function priorityAlerts(req: Request, res: Response): Promise<void> {
  const branchIds = await getBranchIds(req.query.hospital_id as string | undefined);
  const patientBranchFilter = branchIds ? { patient: { branch_id: { in: branchIds } } } : {};
  const bERWhere = branchIds ? { branch_id: { in: branchIds } } : {};
  const bLabWhere = branchIds ? { branch_id: { in: branchIds } } : {};
  const bBloodWhere = branchIds ? { branch_id: { in: branchIds } } : {};
  const bBillWhere = branchIds ? { branch_id: { in: branchIds } } : {};

  const [criticalAdmissions, immediateER, statLabs, urgentBlood, overdueCount] = await Promise.all([
    prisma.admission.findMany({
      where: { status: 'CRITICAL', ...patientBranchFilter },
      select: {
        id: true,
        primary_diagnosis: true,
        admit_date: true,
        updated_at: true,
        patient: { select: { first_name: true, last_name: true, uhid: true, phone: true } },
        beds: {
          select: {
            bed_number: true,
            ward: { select: { name: true, type: true } },
          },
          take: 1,
        },
      },
      orderBy: { updated_at: 'desc' },
      take: 15,
    }),

    prisma.emergencyCase.findMany({
      where: {
        triage_level: 'IMMEDIATE',
        status: { in: ['WAITING', 'BEING_TREATED'] },
        ...bERWhere,
      },
      orderBy: { arrival_time: 'asc' },
      take: 15,
    }),

    prisma.labOrder.findMany({
      where: {
        priority: 'STAT',
        status: { in: ['ORDERED', 'SAMPLE_COLLECTED', 'PROCESSING'] },
        ...bLabWhere,
      },
      select: {
        id: true,
        order_date: true,
        priority: true,
        status: true,
        patient: { select: { first_name: true, last_name: true, uhid: true } },
        tests: { select: { test_name: true } },
      },
      orderBy: { order_date: 'asc' },
      take: 15,
    }),

    prisma.bloodRequest.findMany({
      where: {
        priority: { in: ['URGENT', 'EMERGENCY'] },
        status: 'PENDING',
        ...bBloodWhere,
      },
      select: {
        id: true,
        blood_group: true,
        units_required: true,
        priority: true,
        request_date: true,
        patient: { select: { first_name: true, last_name: true } },
      },
      orderBy: { request_date: 'asc' },
      take: 15,
    }),

    prisma.bill.count({
      where: {
        status: { in: ['OVERDUE', 'PENDING'] },
        due_date: { lt: new Date() },
        ...bBillWhere,
      },
    }),
  ]);

  sendSuccess(res, {
    critical_admissions: criticalAdmissions,
    immediate_er_cases: immediateER,
    stat_lab_orders: statLabs,
    urgent_blood_requests: urgentBlood,
    overdue_bills_count: overdueCount,
    total_alerts:
      criticalAdmissions.length +
      immediateER.length +
      statLabs.length +
      urgentBlood.length +
      (overdueCount > 0 ? 1 : 0),
  });
}

// ── 3. Live OPD Queue ─────────────────────────────────────────────────────────
// GET /superadmin/dashboard/live-opd?hospital_id=xxx

export async function liveOPD(req: Request, res: Response): Promise<void> {
  const { start, end } = todayRange();
  const branchIds = await getBranchIds(req.query.hospital_id as string | undefined);

  const queue = await prisma.patientQueue.findMany({
    where: {
      status: { in: ['WAITING', 'IN_CONSULTATION'] },
      check_in_time: { gte: start, lt: end },
      ...(branchIds ? { branch_id: { in: branchIds } } : {}),
    },
    select: {
      id: true,
      queue_number: true,
      status: true,
      priority: true,
      check_in_time: true,
      consultation_start_time: true,
      doctor_id: true,
      patient: { select: { first_name: true, last_name: true, uhid: true, phone: true } },
      doctor: {
        select: {
          id: true,
          is_available: true,
          user: { select: { first_name: true, last_name: true } },
          department: { select: { name: true } },
        },
      },
      branch: { select: { name: true } },
    },
    orderBy: [{ status: 'asc' }, { queue_number: 'asc' }],
  });

  type DocBucket = {
    doctor_id: string;
    doctor_name: string;
    department: string | null;
    is_available: boolean;
    waiting: number;
    in_consultation: number;
    entries: typeof queue;
  };

  const byDoctor = queue.reduce<Record<string, DocBucket>>((acc, entry) => {
    const key = entry.doctor_id;
    if (!acc[key]) {
      acc[key] = {
        doctor_id: key,
        doctor_name: `Dr. ${entry.doctor.user.first_name} ${entry.doctor.user.last_name}`,
        department: entry.doctor.department?.name ?? null,
        is_available: entry.doctor.is_available,
        waiting: 0,
        in_consultation: 0,
        entries: [],
      };
    }
    if (entry.status === 'WAITING') acc[key].waiting++;
    if (entry.status === 'IN_CONSULTATION') acc[key].in_consultation++;
    acc[key].entries.push(entry);
    return acc;
  }, {});

  sendSuccess(res, {
    summary: {
      total: queue.length,
      waiting: queue.filter(q => q.status === 'WAITING').length,
      in_consultation: queue.filter(q => q.status === 'IN_CONSULTATION').length,
    },
    by_doctor: Object.values(byDoctor),
  });
}

// ── 4. Bed Control ────────────────────────────────────────────────────────────
// GET /superadmin/dashboard/bed-control?hospital_id=xxx

export async function bedControl(req: Request, res: Response): Promise<void> {
  const branchIds = await getBranchIds(req.query.hospital_id as string | undefined);

  const wards = await prisma.ward.findMany({
    where: {
      is_active: true,
      ...(branchIds ? { branch_id: { in: branchIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      type: true,
      floor: true,
      charge_per_day: true,
      beds: { select: { id: true, bed_number: true, status: true, type: true } },
      branch: {
        select: {
          id: true,
          name: true,
          hospital: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const wardStats = wards.map(ward => {
    const beds = ward.beds;
    const counts = {
      total: beds.length,
      available: beds.filter(b => b.status === 'AVAILABLE').length,
      occupied: beds.filter(b => b.status === 'OCCUPIED').length,
      maintenance: beds.filter(b => b.status === 'MAINTENANCE').length,
      reserved: beds.filter(b => b.status === 'RESERVED').length,
    };
    return {
      id: ward.id,
      name: ward.name,
      type: ward.type,
      floor: ward.floor,
      charge_per_day: ward.charge_per_day,
      hospital_id: ward.branch.hospital.id,
      hospital_name: ward.branch.hospital.name,
      branch_id: ward.branch.id,
      branch_name: ward.branch.name,
      ...counts,
      occupancy_pct: counts.total > 0 ? +((counts.occupied / counts.total) * 100).toFixed(1) : 0,
    };
  });

  const totals = wardStats.reduce(
    (acc, w) => ({
      total: acc.total + w.total,
      available: acc.available + w.available,
      occupied: acc.occupied + w.occupied,
      maintenance: acc.maintenance + w.maintenance,
      reserved: acc.reserved + w.reserved,
    }),
    { total: 0, available: 0, occupied: 0, maintenance: 0, reserved: 0 },
  );

  sendSuccess(res, {
    summary: {
      ...totals,
      occupancy_pct: totals.total > 0 ? +((totals.occupied / totals.total) * 100).toFixed(1) : 0,
    },
    wards: wardStats,
  });
}

// ── 5. Appointment Trend ──────────────────────────────────────────────────────
// GET /superadmin/dashboard/appointment-trend?days=7&hospital_id=xxx

export async function appointmentTrend(req: Request, res: Response): Promise<void> {
  const days = Math.min(Number(req.query.days ?? 7), 90);
  const branchIds = await getBranchIds(req.query.hospital_id as string | undefined);

  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);

  const branchSql = branchIds
    ? Prisma.sql`AND branch_id = ANY(${branchIds}::text[])`
    : Prisma.sql``;

  const rows = await prisma.$queryRaw<
    { date: Date; type: string; status: string; count: bigint }[]
  >(Prisma.sql`
    SELECT
      appointment_date::date AS date,
      type,
      status,
      COUNT(*)::bigint AS count
    FROM appointments
    WHERE appointment_date >= ${since}
    ${branchSql}
    GROUP BY appointment_date::date, type, status
    ORDER BY appointment_date::date ASC
  `);

  type DayBucket = {
    date: string;
    total: number;
    completed: number;
    cancelled: number;
    no_show: number;
    by_type: Record<string, number>;
  };
  const dayMap: Record<string, DayBucket> = {};

  for (const row of rows) {
    const d = new Date(row.date).toISOString().slice(0, 10);
    if (!dayMap[d]) {
      dayMap[d] = { date: d, total: 0, completed: 0, cancelled: 0, no_show: 0, by_type: {} };
    }
    const cnt = Number(row.count);
    dayMap[d].total += cnt;
    if (row.status === 'COMPLETED') dayMap[d].completed += cnt;
    if (row.status === 'CANCELLED') dayMap[d].cancelled += cnt;
    if (row.status === 'NO_SHOW') dayMap[d].no_show += cnt;
    dayMap[d].by_type[row.type] = (dayMap[d].by_type[row.type] ?? 0) + cnt;
  }

  sendSuccess(res, {
    days,
    trend: Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)),
  });
}

// ── 6. Revenue Control ────────────────────────────────────────────────────────
// GET /superadmin/dashboard/revenue-control?hospital_id=xxx

export async function revenueControl(req: Request, res: Response): Promise<void> {
  const branchIds = await getBranchIds(req.query.hospital_id as string | undefined);

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const bBillFilter = branchIds
    ? Prisma.sql`AND bi.branch_id = ANY(${branchIds}::text[])`
    : Prisma.sql``;

  const bPayFilter = branchIds
    ? { bill: { branch_id: { in: branchIds } } }
    : {};

  const [todayAgg, weekAgg, monthAgg, byMethod, byHospital, daily30] = await Promise.all([
    prisma.payment.aggregate({
      where: { payment_status: 'SUCCESS', payment_date: { gte: todayStart }, ...bPayFilter },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { payment_status: 'SUCCESS', payment_date: { gte: weekStart }, ...bPayFilter },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { payment_status: 'SUCCESS', payment_date: { gte: monthStart }, ...bPayFilter },
      _sum: { amount: true },
    }),

    // Payment method breakdown (this month)
    prisma.payment.groupBy({
      by: ['method'],
      where: { payment_status: 'SUCCESS', payment_date: { gte: monthStart }, ...bPayFilter },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    }),

    // Revenue by hospital / branch (this month, raw for join)
    prisma.$queryRaw<{ hospital_id: string; hospital_name: string; branch_id: string; branch_name: string; total: number }[]>(
      Prisma.sql`
        SELECT
          h.id    AS hospital_id,
          h.name  AS hospital_name,
          b.id    AS branch_id,
          b.name  AS branch_name,
          COALESCE(SUM(p.amount), 0)::float AS total
        FROM payments p
        JOIN bills bi ON bi.id = p.bill_id
        JOIN branches b ON b.id = bi.branch_id
        JOIN hospitals h ON h.id = b.hospital_id
        WHERE p.payment_status = 'SUCCESS'
          AND p.payment_date >= ${monthStart}
          ${bBillFilter}
        GROUP BY h.id, h.name, b.id, b.name
        ORDER BY total DESC
        LIMIT 30
      `,
    ),

    // Daily revenue — last 30 days
    prisma.$queryRaw<{ date: Date; amount: number }[]>(
      Prisma.sql`
        SELECT
          DATE(p.payment_date)            AS date,
          COALESCE(SUM(p.amount), 0)::float AS amount
        FROM payments p
        JOIN bills bi ON bi.id = p.bill_id
        WHERE p.payment_status = 'SUCCESS'
          AND p.payment_date >= ${monthStart}
          ${bBillFilter}
        GROUP BY DATE(p.payment_date)
        ORDER BY DATE(p.payment_date) ASC
      `,
    ),
  ]);

  sendSuccess(res, {
    today:      todayAgg._sum.amount  ?? 0,
    this_week:  weekAgg._sum.amount   ?? 0,
    this_month: monthAgg._sum.amount  ?? 0,
    by_method: byMethod.map(m => ({ method: m.method, amount: m._sum.amount ?? 0 })),
    by_hospital: byHospital.map(r => ({ ...r, total: Number(r.total) })),
    daily_trend: daily30.map(r => ({
      date: new Date(r.date).toISOString().slice(0, 10),
      amount: Number(r.amount),
    })),
  });
}

// ── 7. Department Overview ────────────────────────────────────────────────────
// GET /superadmin/dashboard/departments?hospital_id=xxx

export async function departmentOverview(req: Request, res: Response): Promise<void> {
  const { start, end } = todayRange();
  const branchIds = await getBranchIds(req.query.hospital_id as string | undefined);

  const depts = await prisma.department.findMany({
    where: {
      is_active: true,
      ...(branchIds ? { branch_id: { in: branchIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      floor: true,
      branch: {
        select: {
          name: true,
          hospital: { select: { id: true, name: true } },
        },
      },
      head_doctor: {
        select: {
          user: { select: { first_name: true, last_name: true } },
        },
      },
      doctors: {
        select: { id: true, is_available: true },
      },
      appointments: {
        where: { appointment_date: { gte: start, lt: end } },
        select: { status: true },
      },
      wards: {
        where: { is_active: true },
        select: {
          beds: { select: { status: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const result = depts.map(dept => {
    const allBeds = dept.wards.flatMap(w => w.beds);
    return {
      id: dept.id,
      name: dept.name,
      description: dept.description,
      floor: dept.floor,
      hospital_id: dept.branch.hospital.id,
      hospital_name: dept.branch.hospital.name,
      branch_name: dept.branch.name,
      head_doctor: dept.head_doctor
        ? `Dr. ${dept.head_doctor.user.first_name} ${dept.head_doctor.user.last_name}`
        : null,
      total_doctors: dept.doctors.length,
      available_doctors: dept.doctors.filter(d => d.is_available).length,
      today_appointments: dept.appointments.length,
      today_completed: dept.appointments.filter(a => a.status === 'COMPLETED').length,
      today_pending: dept.appointments.filter(a =>
        ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status),
      ).length,
      today_cancelled: dept.appointments.filter(a => a.status === 'CANCELLED').length,
      beds_total: allBeds.length,
      beds_available: allBeds.filter(b => b.status === 'AVAILABLE').length,
      beds_occupied: allBeds.filter(b => b.status === 'OCCUPIED').length,
    };
  });

  sendSuccess(res, result);
}
