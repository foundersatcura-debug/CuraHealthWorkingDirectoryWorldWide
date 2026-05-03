/**
 * TypeORM Entity Definitions
 * Run: npx typeorm migration:generate src/migrations/Init -d src/data-source.ts
 */

import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';

// ─── Multi-Tenancy ────────────────────────────────────────────────────────────

@Entity('hospitals')
export class Hospital {
  @PrimaryGeneratedColumn('uuid') hospital_id!: string;
  @Column() name!: string;
  @Column({ nullable: true }) address?: string;
  @Column({ default: true }) is_active!: boolean;
  @CreateDateColumn() created_at!: Date;
}

@Entity('branches')
export class Branch {
  @PrimaryGeneratedColumn('uuid') branch_id!: string;
  @Column() hospital_id!: string;
  @Column() name!: string;
  @Column() city!: string;
  @Column({ nullable: true }) address?: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ default: true }) is_active!: boolean;
  @CreateDateColumn() created_at!: Date;
}

@Entity('departments')
export class Department {
  @PrimaryGeneratedColumn('uuid') dept_id!: string;
  @Column() branch_id!: string;
  @Column() name!: string;
  @Column({ nullable: true }) description?: string;
  @Column({ nullable: true }) head_doctor_id?: string;
  @Column({ nullable: true }) floor?: number;
  @Column({ nullable: true }) extension?: string;
  @Column({ default: true }) is_active!: boolean;
}

// ─── Users & RBAC ─────────────────────────────────────────────────────────────

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid') role_id!: string;
  @Column() name!: string;
  @Column() role_type!: string;
  @Column({ nullable: true }) description?: string;
  /**
   * permissions: JSON shape:
   * {
   *   "patients": { "read": true, "write": false, "delete": false },
   *   "vitals":   { "read": true, "write": true, "delete": false },
   *   ...
   * }
   */
  @Column({ type: 'jsonb' }) permissions!: Record<string, Record<string, boolean>>;
  @Column({ default: true }) is_system!: boolean;
  @CreateDateColumn() created_at!: Date;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') user_id!: string;
  @Column() branch_id!: string;
  @Column() role_id!: string;
  @Column({ nullable: true }) dept_id?: string;
  @Column() full_name!: string;
  @Column({ unique: true }) email!: string;
  @Column() password_hash!: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ nullable: true }) doctor_id?: string;
  @Column({ default: true }) is_active!: boolean;
  @Column({ nullable: true }) last_login?: Date;
  @CreateDateColumn() created_at!: Date;
  @UpdateDateColumn() updated_at!: Date;
}

// ─── Patient ──────────────────────────────────────────────────────────────────

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid') patient_id!: string;
  @Column() branch_id!: string;
  @Column({ unique: true }) uhid!: string;
  @Column() first_name!: string;
  @Column() last_name!: string;
  @Column({ type: 'date' }) dob!: string;
  @Column() gender!: string;
  @Column({ nullable: true }) blood_group?: string;
  @Column() phone!: string;
  @Column({ nullable: true }) email?: string;
  @Column({ type: 'jsonb', nullable: true }) address?: Record<string, string>;
  @Column({ type: 'jsonb', nullable: true }) emergency_contact?: Record<string, string>;
  @Column({ nullable: true }) insurance_id?: string;
  @Column({ default: true }) is_active!: boolean;
  @CreateDateColumn() registration_date!: Date;
}

// ─── Ward & Bed ───────────────────────────────────────────────────────────────

@Entity('wards')
export class Ward {
  @PrimaryGeneratedColumn('uuid') ward_id!: string;
  @Column() branch_id!: string;
  @Column() dept_id!: string;
  @Column() name!: string;
  @Column() type!: string;
  @Column({ nullable: true }) floor?: number;
  @Column() total_beds!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) charge_per_day!: number;
  @Column({ default: true }) is_active!: boolean;
}

@Entity('beds')
export class Bed {
  @PrimaryGeneratedColumn('uuid') bed_id!: string;
  @Column() ward_id!: string;
  @Column() bed_number!: string;
  @Column() type!: string;
  @Column({ default: 'available' }) status!: string;
  @Column({ nullable: true }) patient_id?: string;
  @Column({ nullable: true }) admission_id?: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) charge_per_day!: number;
  @Column({ type: 'jsonb', default: [] }) features!: string[];
}

// ─── Admissions ───────────────────────────────────────────────────────────────

@Entity('admissions')
export class Admission {
  @PrimaryGeneratedColumn('uuid') admission_id!: string;
  @Column() patient_id!: string;
  @Column() doctor_id!: string;
  @Column() ward_id!: string;
  @Column() bed_id!: string;
  @Column() branch_id!: string;
  @Column({ type: 'timestamp' }) admit_date!: Date;
  @Column({ type: 'timestamp', nullable: true }) discharge_date?: Date;
  @Column({ type: 'timestamp', nullable: true }) expected_discharge?: Date;
  @Column() admission_type!: string;
  @Column({ nullable: true }) primary_diagnosis?: string;
  @Column({ default: 'admitted' }) status!: string;
  @Column({ nullable: true }) diet_type?: string;
  @Column({ nullable: true }) notes?: string;
  @CreateDateColumn() created_at!: Date;
}

// ─── Vitals History ───────────────────────────────────────────────────────────

@Entity('vitals_history')
export class VitalsHistory {
  @PrimaryGeneratedColumn('uuid') vitals_id!: string;
  @Column() patient_id!: string;
  @Column() admission_id!: string;
  @Column() recorded_by!: string;  // user_id of nurse
  @Column({ type: 'smallint' }) bp_systolic!: number;
  @Column({ type: 'smallint' }) bp_diastolic!: number;
  @Column({ type: 'smallint' }) heart_rate!: number;
  @Column({ type: 'smallint' }) spo2!: number;
  @Column({ type: 'decimal', precision: 4, scale: 1 }) temperature!: number;
  @Column({ type: 'smallint' }) respiratory_rate!: number;
  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true }) weight?: number;
  @Column({ type: 'smallint', default: 0 }) pain_score!: number;
  @Column({ nullable: true }) notes?: string;
  @CreateDateColumn() recorded_at!: Date;
}

// ─── Clinical Notes ───────────────────────────────────────────────────────────

@Entity('clinical_notes')
export class ClinicalNote {
  @PrimaryGeneratedColumn('uuid') note_id!: string;
  @Column() patient_id!: string;
  @Column({ nullable: true }) admission_id?: string;
  @Column({ nullable: true }) appointment_id?: string;
  @Column() doctor_id!: string;
  @Column() note_type!: string; // 'soap' | 'progress' | 'discharge' | 'procedure'
  @Column({ type: 'jsonb' }) content!: Record<string, unknown>;
  @Column({ type: 'jsonb', default: [] }) diagnoses!: Record<string, unknown>[];
  @CreateDateColumn() created_at!: Date;
  @UpdateDateColumn() updated_at!: Date;
}

// ─── Prescriptions ────────────────────────────────────────────────────────────

@Entity('prescriptions')
export class Prescription {
  @PrimaryGeneratedColumn('uuid') prescription_id!: string;
  @Column() patient_id!: string;
  @Column() doctor_id!: string;
  @Column({ nullable: true }) admission_id?: string;
  @Column({ nullable: true }) appointment_id?: string;
  @Column({ default: 'active' }) status!: string;
  @Column({ nullable: true }) notes?: string;
  @CreateDateColumn() prescribed_at!: Date;
  @OneToMany(() => PrescriptionItem, (i) => i.prescription, { cascade: true })
  items!: PrescriptionItem[];
}

@Entity('prescription_items')
export class PrescriptionItem {
  @PrimaryGeneratedColumn('uuid') item_id!: string;
  @Column() prescription_id!: string;
  @ManyToOne(() => Prescription, (p) => p.items)
  @JoinColumn({ name: 'prescription_id' })
  prescription!: Prescription;

  @Column() medicine_name!: string;
  @Column({ nullable: true }) medicine_id?: string;
  @Column() dosage!: string;
  @Column() frequency!: string;
  @Column() duration!: string;
  @Column() route!: string;
  @Column({ nullable: true }) instructions?: string;
  @Column({ default: 1 }) quantity!: number;
}

// ─── Medication Administration ────────────────────────────────────────────────

@Entity('medication_administrations')
export class MedicationAdministration {
  @PrimaryGeneratedColumn('uuid') admin_id!: string;
  @Column() item_id!: string;
  @Column() prescription_id!: string;
  @Column() patient_id!: string;
  @Column() admission_id!: string;
  @Column() given_by!: string; // nurse user_id
  @Column() dose_given!: string;
  @Column() route!: string;
  @Column({ nullable: true }) notes?: string;
  @Column({ nullable: true }) witness_id?: string;
  @CreateDateColumn() given_at!: Date;
}

// ─── Patient Queue ────────────────────────────────────────────────────────────

@Entity('patient_queue')
export class PatientQueue {
  @PrimaryGeneratedColumn('uuid') queue_id!: string;
  @Column() branch_id!: string;
  @Column() dept_id!: string;
  @Column() doctor_id!: string;
  @Column({ nullable: true }) patient_id?: string;
  @Column({ nullable: true }) appointment_id?: string;
  @Column() token_number!: number;
  @Column({ nullable: true }) patient_name?: string;
  @Column({ nullable: true }) phone?: string;
  @Column() visit_type!: string;
  @Column({ default: 'normal' }) priority!: string;
  @Column() chief_complaint!: string;
  @Column({ default: 'waiting' }) status!: string;
  @Column({ default: false }) vitals_done!: boolean;
  @Column({ nullable: true }) notes?: string;
  @CreateDateColumn() registered_at!: Date;
  @Column({ type: 'timestamp', nullable: true }) called_at?: Date;
  @Column({ type: 'timestamp', nullable: true }) completed_at?: Date;
}

// ─── Invoices & Payments ──────────────────────────────────────────────────────

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid') invoice_id!: string;
  @Column({ unique: true }) invoice_number!: string;
  @Column() patient_id!: string;
  @Column() branch_id!: string;
  @Column({ nullable: true }) admission_id?: string;
  @Column({ nullable: true }) appointment_id?: string;
  @Column({ type: 'jsonb', default: [] }) items!: Record<string, unknown>[];
  @Column({ type: 'decimal', precision: 12, scale: 2 }) subtotal!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) discount!: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) tax!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) total!: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) paid_amount!: number;
  @Column({ default: 'pending' }) status!: string;
  @Column({ nullable: true }) insurance_id?: string;
  @CreateDateColumn() created_at!: Date;
  @UpdateDateColumn() updated_at!: Date;
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid') payment_id!: string;
  @Column() invoice_id!: string;
  @Column() patient_id!: string;
  @Column() branch_id!: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount!: number;
  @Column() payment_method!: string;
  @Column({ nullable: true }) reference_number?: string;
  @Column() received_by!: string; // user_id
  @Column({ nullable: true }) notes?: string;
  @CreateDateColumn() payment_date!: Date;
}

// ─── Audit & Compliance ───────────────────────────────────────────────────────

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') log_id!: string;
  @Column() user_id!: string;
  @Column() branch_id!: string;
  @Column() action!: string;
  @Column() resource!: string;
  @Column({ nullable: true }) resource_id?: string;
  @Column({ type: 'text' }) description!: string;
  @Column({ nullable: true }) ip_address?: string;
  @Column({ nullable: true }) user_agent?: string;
  @Column({ default: 'success' }) status!: string;
  @Column({ default: 'low' }) severity!: string;
  @CreateDateColumn() timestamp!: Date;
}
