/**
 * Reception / Counter Controller
 * Handles: queue management, patient registration, appointments, beds, billing
 */

import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { PatientQueue, Patient, Bed, Ward, Invoice, Payment } from '../entities';
import { logAudit } from '../middleware/rbac.middleware';
import { broadcastToChannel } from '../websocket/queueSocket';

// ─── GET /api/reception/queue ─────────────────────────────────────────────────

export async function getOPDQueue(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const { dept_id, doctor_id, status } = req.query;

    const repo = AppDataSource.getRepository(PatientQueue);
    const query = repo.createQueryBuilder('q')
      .where('q.branch_id = :branch_id', { branch_id })
      .andWhere("q.registered_at::date = CURRENT_DATE")
      .orderBy(`CASE q.priority WHEN 'emergency' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END`, 'ASC')
      .addOrderBy('q.registered_at', 'ASC');

    if (dept_id) query.andWhere('q.dept_id = :dept_id', { dept_id });
    if (doctor_id) query.andWhere('q.doctor_id = :doctor_id', { doctor_id });
    if (status) {
      query.andWhere('q.status = :status', { status });
    } else {
      query.andWhere("q.status NOT IN ('cancelled')");
    }

    const queue = await query.getMany();
    res.json({ success: true, data: queue });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch queue' });
  }
}

// ─── POST /api/reception/queue ────────────────────────────────────────────────

export async function addToQueue(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const {
      patient_id, appointment_id,
      dept_id, doctor_id,
      patient_name, phone,
      visit_type, priority, chief_complaint, notes,
    } = req.body;

    if (!dept_id || !doctor_id || !chief_complaint) {
      res.status(400).json({ success: false, message: 'dept_id, doctor_id and chief_complaint are required' });
      return;
    }

    // Auto-generate next token number for today
    const lastToken = await AppDataSource.query(`
      SELECT COALESCE(MAX(token_number), 0) AS max_token
      FROM patient_queue
      WHERE branch_id = $1 AND registered_at::date = CURRENT_DATE
    `, [branch_id]);
    const tokenNumber = parseInt(lastToken[0].max_token) + 1;

    const repo = AppDataSource.getRepository(PatientQueue);
    const entry = repo.create({
      branch_id,
      patient_id,
      appointment_id,
      dept_id,
      doctor_id,
      patient_name,
      phone,
      visit_type: visit_type ?? 'opd',
      priority: priority ?? 'normal',
      chief_complaint,
      notes,
      token_number: tokenNumber,
      status: 'waiting',
    });

    await repo.save(entry);

    // Broadcast real-time update to all subscribers
    broadcastToChannel('queue:opd', {
      type: 'QUEUE_PATIENT_ADDED',
      channel: 'queue:opd',
      payload: {
        queue_id: entry.queue_id,
        token_number: tokenNumber,
        patient_name,
        priority,
        dept_id,
        doctor_id,
        status: 'waiting',
      },
      timestamp: new Date().toISOString(),
    });

    await logAudit(req, 'CREATE', 'patient_queue', entry.queue_id,
      `Added ${patient_name ?? 'walk-in'} to queue (Token #${tokenNumber})`);

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add to queue' });
  }
}

// ─── PUT /api/reception/queue/:queueId ───────────────────────────────────────

export async function updateQueueStatus(req: Request, res: Response): Promise<void> {
  try {
    const { queueId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['waiting', 'vitals_check', 'with_doctor', 'completed', 'no_show', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }

    const updates: Partial<PatientQueue> = {
      status,
      notes,
      ...(status === 'with_doctor' ? { called_at: new Date() } : {}),
      ...(status === 'completed' ? { completed_at: new Date() } : {}),
    };

    await AppDataSource.getRepository(PatientQueue).update(queueId, updates);

    // Broadcast status change
    broadcastToChannel('queue:opd', {
      type: 'QUEUE_STATUS_CHANGED',
      channel: 'queue:opd',
      payload: { queue_id: queueId, status },
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, message: `Queue status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update queue status' });
  }
}

// ─── POST /api/reception/patients ────────────────────────────────────────────

export async function registerPatient(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const {
      first_name, last_name, dob, gender,
      phone, blood_group, email, address, emergency_contact,
    } = req.body;

    if (!first_name || !phone || !gender) {
      res.status(400).json({ success: false, message: 'first_name, phone, gender are required' });
      return;
    }

    // Generate UHID: UHID-YYYY-NNNN
    const year = new Date().getFullYear();
    const countResult = await AppDataSource.query(`
      SELECT COUNT(*) AS cnt FROM patients WHERE branch_id = $1
    `, [branch_id]);
    const count = parseInt(countResult[0].cnt) + 1;
    const uhid = `UHID-${year}-${String(count).padStart(4, '0')}`;

    const repo = AppDataSource.getRepository(Patient);
    const patient = repo.create({
      branch_id,
      uhid,
      first_name,
      last_name: last_name ?? '',
      dob,
      gender,
      phone,
      blood_group,
      email,
      address,
      emergency_contact,
    });

    await repo.save(patient);

    await logAudit(req, 'CREATE', 'patients', patient.patient_id,
      `Registered new patient: ${first_name} ${last_name ?? ''} (${uhid})`);

    res.status(201).json({ success: true, data: patient });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to register patient' });
  }
}

// ─── GET /api/reception/beds ──────────────────────────────────────────────────

export async function getBedAvailability(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const { ward_type } = req.query;

    const query = `
      SELECT
        w.ward_id, w.name AS ward_name, w.type AS ward_type, w.floor,
        w.charge_per_day,
        COUNT(b.bed_id)                                           AS total_beds,
        COUNT(b.bed_id) FILTER (WHERE b.status = 'available')    AS available_beds,
        COUNT(b.bed_id) FILTER (WHERE b.status = 'occupied')     AS occupied_beds,
        COUNT(b.bed_id) FILTER (WHERE b.status = 'reserved')     AS reserved_beds,
        COUNT(b.bed_id) FILTER (WHERE b.status = 'maintenance')  AS maintenance_beds
      FROM wards w
      LEFT JOIN beds b ON b.ward_id = w.ward_id
      WHERE w.branch_id = $1 AND w.is_active = true
      ${ward_type ? 'AND w.type = $2' : ''}
      GROUP BY w.ward_id
      ORDER BY w.floor, w.name
    `;

    const params = ward_type ? [branch_id, ward_type] : [branch_id];
    const result = await AppDataSource.query(query, params);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch bed availability' });
  }
}

// ─── GET /api/reception/appointments/today ────────────────────────────────────

export async function getTodayAppointments(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const { doctor_id, dept_id } = req.query;

    const query = AppDataSource.query(`
      SELECT
        a.appointment_id, a.token_number, a.appointment_time, a.type,
        a.status, a.chief_complaint,
        p.first_name || ' ' || p.last_name AS patient_name,
        p.uhid, p.phone,
        u.full_name AS doctor_name,
        d.name AS dept_name
      FROM appointments a
      JOIN patients p ON p.patient_id = a.patient_id
      JOIN users u ON u.user_id = a.doctor_id
      JOIN departments d ON d.dept_id = a.dept_id
      WHERE a.branch_id = $1
        AND a.appointment_date = CURRENT_DATE
        ${doctor_id ? 'AND a.doctor_id = $2' : ''}
        ${dept_id ? `AND a.dept_id = $${doctor_id ? 3 : 2}` : ''}
      ORDER BY a.appointment_time ASC
    `, [branch_id, ...(doctor_id ? [doctor_id] : []), ...(dept_id ? [dept_id] : [])]);

    res.json({ success: true, data: await query });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch appointments' });
  }
}

// ─── POST /api/reception/invoices ─────────────────────────────────────────────

export async function createInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const { patient_id, admission_id, appointment_id, items, discount, notes } = req.body;

    if (!patient_id || !items?.length) {
      res.status(400).json({ success: false, message: 'patient_id and items are required' });
      return;
    }

    // Calculate totals
    const subtotal: number = items.reduce((s: number, i: { quantity: number; unit_price: number }) =>
      s + i.quantity * i.unit_price, 0);
    const discountAmt = (subtotal * (Number(discount ?? 0) / 100));
    const tax = (subtotal - discountAmt) * 0.05; // 5% GST
    const total = subtotal - discountAmt + tax;

    // Generate invoice number
    const year = new Date().getFullYear();
    const count = (await AppDataSource.query(`SELECT COUNT(*) AS cnt FROM invoices WHERE branch_id = $1`, [branch_id]))[0].cnt;
    const invoice_number = `INV-${year}-${String(parseInt(count) + 1).padStart(5, '0')}`;

    const repo = AppDataSource.getRepository(Invoice);
    const invoice = repo.create({
      invoice_number,
      patient_id,
      branch_id,
      admission_id,
      appointment_id,
      items,
      subtotal,
      discount: Number(discount ?? 0),
      tax,
      total,
      paid_amount: 0,
      status: 'pending',
    });

    await repo.save(invoice);

    await logAudit(req, 'CREATE', 'billing', invoice.invoice_id,
      `Created invoice ${invoice_number} – ₹${total.toFixed(2)}`);

    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create invoice' });
  }
}

// ─── POST /api/reception/payments ─────────────────────────────────────────────

export async function recordPayment(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const { invoice_id, patient_id, amount, payment_method, reference_number, notes } = req.body;

    if (!invoice_id || !amount || !payment_method) {
      res.status(400).json({ success: false, message: 'invoice_id, amount, payment_method required' });
      return;
    }

    // Save payment
    const payRepo = AppDataSource.getRepository(Payment);
    const payment = payRepo.create({
      invoice_id,
      patient_id,
      branch_id,
      amount: Number(amount),
      payment_method,
      reference_number,
      received_by: req.user!.user_id,
      notes,
    });
    await payRepo.save(payment);

    // Update invoice paid_amount + status
    const invRepo = AppDataSource.getRepository(Invoice);
    const invoice = await invRepo.findOneBy({ invoice_id });
    if (invoice) {
      const newPaid = parseFloat(invoice.paid_amount as unknown as string) + Number(amount);
      const newStatus = newPaid >= parseFloat(invoice.total as unknown as string) ? 'paid' : 'partial';
      await invRepo.update(invoice_id, { paid_amount: newPaid, status: newStatus });
    }

    await logAudit(req, 'CREATE', 'billing', payment.payment_id,
      `Received payment ₹${amount} (${payment_method}) for invoice ${invoice_id}`);

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to record payment' });
  }
}
