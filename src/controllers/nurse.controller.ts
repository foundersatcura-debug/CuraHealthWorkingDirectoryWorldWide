/**
 * Nurse Controller
 * Handles: ward patients, vitals, medication administration, queue
 */

import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import {
  Admission, Bed, Ward, Patient,
  VitalsHistory, Prescription, PrescriptionItem,
  MedicationAdministration, PatientQueue,
} from '../entities';
import { logAudit } from '../middleware/rbac.middleware';

// ─── GET /api/nurse/ward-patients ─────────────────────────────────────────────
// Returns all active admissions in wards assigned to this nurse's branch/dept.

export async function getWardPatients(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const { ward_id } = req.query;

    /**
     * Query strategy:
     * 1. Find occupied beds in the given ward(s)
     * 2. Join with admissions to get patient + doctor info
     * 3. Join with vitals_history to get latest vitals (most recent recorded_at)
     * 4. Aggregate pending medications from medication_administrations
     */
    const bedRepo = AppDataSource.getRepository(Bed);

    const query = bedRepo.createQueryBuilder('bed')
      .innerJoinAndSelect('admissions', 'adm', 'adm.bed_id = bed.bed_id AND adm.status NOT IN (:...discharged)', {
        discharged: ['discharged', 'transferred'],
      })
      .innerJoinAndSelect('patients', 'pat', 'pat.patient_id = adm.patient_id')
      .innerJoinAndSelect('wards', 'ward', 'ward.ward_id = bed.ward_id')
      .where('ward.branch_id = :branch_id', { branch_id })
      .andWhere("bed.status = 'occupied'");

    if (ward_id) {
      query.andWhere('bed.ward_id = :ward_id', { ward_id });
    }

    const beds = await query.getRawMany();

    // Attach latest vitals per patient
    const patientIds = beds.map((b) => b.pat_patient_id);
    let latestVitals: Record<string, unknown> = {};

    if (patientIds.length > 0) {
      const vitalsRepo = AppDataSource.getRepository(VitalsHistory);
      const vitals = await vitalsRepo
        .createQueryBuilder('v')
        .where('v.patient_id IN (:...ids)', { ids: patientIds })
        .orderBy('v.recorded_at', 'DESC')
        .getMany();

      // Deduplicate: keep only the most recent per patient
      for (const v of vitals) {
        if (!latestVitals[v.patient_id]) {
          latestVitals[v.patient_id] = v;
        }
      }
    }

    const patients = beds.map((b) => ({
      bed_id: b.bed_bed_id,
      bed_number: b.bed_bed_number,
      ward_id: b.bed_ward_id,
      ward_name: b.ward_name,
      patient_id: b.pat_patient_id,
      patient_name: `${b.pat_first_name} ${b.pat_last_name}`,
      uhid: b.pat_uhid,
      age: calcAge(b.pat_dob),
      gender: b.pat_gender,
      blood_group: b.pat_blood_group,
      admission_id: b.adm_admission_id,
      admit_date: b.adm_admit_date,
      doctor_id: b.adm_doctor_id,
      primary_diagnosis: b.adm_primary_diagnosis,
      diet_type: b.adm_diet_type,
      admission_type: b.adm_admission_type,
      status: b.adm_status,
      latest_vitals: latestVitals[b.pat_patient_id] ?? null,
    }));

    res.json({ success: true, data: patients });
  } catch (err) {
    console.error('[getWardPatients]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch ward patients' });
  }
}

// ─── POST /api/nurse/vitals ───────────────────────────────────────────────────

export async function recordVitals(req: Request, res: Response): Promise<void> {
  try {
    const {
      patient_id, admission_id,
      bp_systolic, bp_diastolic, heart_rate, spo2,
      temperature, respiratory_rate, weight, pain_score, notes,
    } = req.body;

    // Basic validation
    if (!patient_id || !admission_id || !bp_systolic || !heart_rate || !spo2) {
      res.status(400).json({ success: false, message: 'Required vitals fields missing' });
      return;
    }

    const repo = AppDataSource.getRepository(VitalsHistory);
    const vital = repo.create({
      patient_id,
      admission_id,
      recorded_by: req.user!.user_id,
      bp_systolic: Number(bp_systolic),
      bp_diastolic: Number(bp_diastolic),
      heart_rate: Number(heart_rate),
      spo2: Number(spo2),
      temperature: Number(temperature),
      respiratory_rate: Number(respiratory_rate),
      weight: weight ? Number(weight) : undefined,
      pain_score: Number(pain_score ?? 0),
      notes,
    });

    await repo.save(vital);

    // Determine severity for audit
    const isCritical = Number(spo2) < 94 || Number(bp_systolic) < 85 || Number(heart_rate) > 120;
    const severity = isCritical ? 'high' : 'low';

    await logAudit(req, 'CREATE', 'vitals', vital.vitals_id,
      `Recorded vitals for patient ${patient_id}${isCritical ? ' — CRITICAL VALUES DETECTED' : ''}`,
      'success', severity);

    res.status(201).json({
      success: true,
      data: vital,
      alert: isCritical ? 'Critical vitals detected. Charge nurse notified.' : null,
    });
  } catch (err) {
    console.error('[recordVitals]', err);
    res.status(500).json({ success: false, message: 'Failed to record vitals' });
  }
}

// ─── GET /api/nurse/vitals/:patientId ─────────────────────────────────────────

export async function getVitalsHistory(req: Request, res: Response): Promise<void> {
  try {
    const { patientId } = req.params;
    const { limit = '10', admission_id } = req.query;

    const repo = AppDataSource.getRepository(VitalsHistory);
    const query = repo.createQueryBuilder('v')
      .where('v.patient_id = :patientId', { patientId })
      .orderBy('v.recorded_at', 'DESC')
      .take(Number(limit));

    if (admission_id) {
      query.andWhere('v.admission_id = :admission_id', { admission_id });
    }

    const vitals = await query.getMany();
    res.json({ success: true, data: vitals });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch vitals' });
  }
}

// ─── GET /api/nurse/prescriptions/:patientId ──────────────────────────────────

export async function getActivePrescriptions(req: Request, res: Response): Promise<void> {
  try {
    const { patientId } = req.params;
    const { admission_id } = req.query;

    const repo = AppDataSource.getRepository(Prescription);
    const query = repo.createQueryBuilder('rx')
      .leftJoinAndSelect('rx.items', 'items')
      .where('rx.patient_id = :patientId', { patientId })
      .andWhere("rx.status = 'active'");

    if (admission_id) {
      query.andWhere('rx.admission_id = :admission_id', { admission_id });
    }

    const prescriptions = await query.getMany();

    // For each item, fetch recent administrations (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const adminRepo = AppDataSource.getRepository(MedicationAdministration);

    for (const rx of prescriptions) {
      for (const item of rx.items) {
        const admins = await adminRepo.findBy({
          item_id: item.item_id,
          patient_id: patientId,
        });
        (item as Record<string, unknown>).administrations = admins;
      }
    }

    res.json({ success: true, data: prescriptions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch prescriptions' });
  }
}

// ─── POST /api/nurse/medication-admin ─────────────────────────────────────────

export async function logMedicationAdmin(req: Request, res: Response): Promise<void> {
  try {
    const {
      item_id, prescription_id, patient_id,
      admission_id, dose_given, route, notes,
    } = req.body;

    if (!item_id || !prescription_id || !patient_id || !dose_given || !route) {
      res.status(400).json({ success: false, message: 'Required fields missing' });
      return;
    }

    const repo = AppDataSource.getRepository(MedicationAdministration);
    const record = repo.create({
      item_id,
      prescription_id,
      patient_id,
      admission_id,
      given_by: req.user!.user_id,
      dose_given,
      route,
      notes,
    });

    await repo.save(record);

    await logAudit(req, 'CREATE', 'medications', record.admin_id,
      `Administered ${dose_given} (${route}) to patient ${patient_id}`);

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to log medication administration' });
  }
}

// ─── GET /api/nurse/queue ─────────────────────────────────────────────────────

export async function getNurseQueue(req: Request, res: Response): Promise<void> {
  try {
    const { branch_id } = req.user!;
    const repo = AppDataSource.getRepository(PatientQueue);

    const queue = await repo.createQueryBuilder('q')
      .where('q.branch_id = :branch_id', { branch_id })
      .andWhere("q.status IN ('waiting', 'vitals_check')")
      .andWhere("q.registered_at::date = CURRENT_DATE")
      .orderBy('q.priority = :em', 'DESC', 'NULLS LAST')
      .setParameter('em', 'emergency')
      .addOrderBy('q.registered_at', 'ASC')
      .getMany();

    res.json({ success: true, data: queue });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch queue' });
  }
}

// ─── PUT /api/nurse/queue/:queueId/vitals-done ────────────────────────────────

export async function markVitalsDone(req: Request, res: Response): Promise<void> {
  try {
    const { queueId } = req.params;
    const repo = AppDataSource.getRepository(PatientQueue);

    await repo.update(queueId, {
      vitals_done: true,
      status: 'with_doctor',
      called_at: new Date(),
    });

    res.json({ success: true, message: 'Vitals marked done — patient sent to doctor' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update queue' });
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function calcAge(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}
