import { prisma } from '../config/database';

export async function generateUHID(branchCode: string): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const count = await prisma.patient.count({
    where: { branch: { code: branchCode } },
  });
  const seq = String(count + 1).padStart(6, '0');
  return `UHID-${branchCode.toUpperCase()}-${year}-${seq}`;
}

export async function generateBillNumber(branchCode?: string): Promise<string> {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const count = await prisma.bill.count();
  const seq = String(count + 1).padStart(5, '0');
  const prefix = branchCode ? branchCode.toUpperCase() : 'BILL';
  return `${prefix}-${year}${month}-${seq}`;
}

export async function generateTokenNumber(doctorId: string, date: Date): Promise<number> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const count = await prisma.appointment.count({
    where: {
      doctor_id: doctorId,
      appointment_date: { gte: start, lte: end },
      status: { not: 'CANCELLED' },
    },
  });
  return count + 1;
}

export function generateHospitalCode(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 6);
}
