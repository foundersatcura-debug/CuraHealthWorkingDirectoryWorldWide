import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding Cura Healthcare database...');

  // ─── Hospital ──────────────────────────────────────────────────────────────
  const hospital = await prisma.hospital.upsert({
    where: { code: 'CURA-001' },
    update: {},
    create: {
      name: 'Cura General Hospital',
      code: 'CURA-001',
      description: 'A leading multi-specialty hospital providing world-class healthcare.',
      phone: '+91-9876543210',
      email: 'admin@curahospital.in',
      tax_id: 'GSTIN1234567890',
      address: {
        line1: '123, Healthcare Avenue',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
      },
    },
  });
  console.log('✅  Hospital created:', hospital.name);

  // ─── Branch ────────────────────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { hospital_id_code: { hospital_id: hospital.id, code: 'MAIN' } },
    update: {},
    create: {
      hospital_id: hospital.id,
      name: 'Main Branch',
      code: 'MAIN',
      type: 'main',
      phone: '+91-9876543210',
      email: 'main@curahospital.in',
      timing: { open: '08:00', close: '22:00', days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] },
      address: {
        line1: '123, Healthcare Avenue',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
      },
    },
  });
  console.log('✅  Branch created:', branch.name);

  // ─── Subscription & Settings ───────────────────────────────────────────────
  await prisma.subscription.upsert({
    where: { hospital_id: hospital.id },
    update: {},
    create: {
      hospital_id: hospital.id,
      plan: 'ENTERPRISE',
      billing_cycle: 'ANNUAL',
      user_limit: 500,
      patient_limit: 100000,
    },
  });

  await prisma.hospitalSettings.upsert({
    where: { hospital_id: hospital.id },
    update: {},
    create: {
      hospital_id: hospital.id,
      regional: { currency: 'INR', timezone: 'Asia/Kolkata', language: 'en', date_format: 'DD/MM/YYYY' },
      modules_enabled: {
        ipd: true, opd: true, pharmacy: true, laboratory: true,
        radiology: true, emergency: true, blood_bank: true, b2c: true,
      },
    },
  });

  // ─── Departments ───────────────────────────────────────────────────────────
  const deptNames = ['Cardiology', 'Radiology', 'Orthopedics', 'Neurology', 'Pediatrics', 'Gynecology', 'General Medicine', 'Emergency'];
  const departments: Record<string, string> = {};

  for (const name of deptNames) {
    const dept = await prisma.department.upsert({
      where: { branch_id_name: { branch_id: branch.id, name } },
      update: {},
      create: { branch_id: branch.id, name, description: `${name} department` },
    });
    departments[name] = dept.id;
  }
  console.log('✅  Departments created');

  // ─── Roles ─────────────────────────────────────────────────────────────────
  const roleData = [
    { role_name: 'Admin', permission_json: { manage_users: true, view_reports: true, edit_records: true, manage_billing: true } },
    { role_name: 'Doctor', permission_json: { view_patients: true, prescribe_medicine: true, edit_patient_records: true, create_patient: true } },
    { role_name: 'Nurse', permission_json: { view_patients: true, update_vitals: true, prescribe_medicine: false, view_reports: true } },
    { role_name: 'Pharmacist', permission_json: { view_prescriptions: true, dispense_medicine: true, manage_inventory: true } },
    { role_name: 'Receptionist', permission_json: { create_patient: true, book_appointments: true, manage_billing: true, view_reports: false } },
    { role_name: 'LabTechnician', permission_json: { view_lab_orders: true, update_results: true, manage_samples: true } },
  ];

  for (const role of roleData) {
    await prisma.role.upsert({ where: { role_name: role.role_name }, update: {}, create: role });
  }
  console.log('✅  Roles created');

  // ─── Users ─────────────────────────────────────────────────────────────────
  const hashPw = async (pw: string) => bcrypt.hash(pw, 10);

  await prisma.user.upsert({
    where: { email: 'superadmin@curahospital.in' },
    update: {},
    create: { branch_id: branch.id, email: 'superadmin@curahospital.in', password: await hashPw('SuperAdmin@123'), role: 'SUPER_ADMIN', first_name: 'Super', last_name: 'Admin', phone: '+91-9000000001' },
  });

  await prisma.user.upsert({
    where: { email: 'founder@curahospital.in' },
    update: {},
    create: { branch_id: branch.id, email: 'founder@curahospital.in', password: await hashPw('Founder@123'), role: 'FOUNDER', first_name: 'Rajesh', last_name: 'Sharma', phone: '+91-9000000002' },
  });

  await prisma.user.upsert({
    where: { email: 'branchadmin@curahospital.in' },
    update: {},
    create: { branch_id: branch.id, email: 'branchadmin@curahospital.in', password: await hashPw('Admin@123'), role: 'BRANCH_ADMIN', first_name: 'Priya', last_name: 'Mehta', phone: '+91-9000000003' },
  });

  await prisma.user.upsert({
    where: { email: 'reception@curahospital.in' },
    update: {},
    create: { branch_id: branch.id, email: 'reception@curahospital.in', password: await hashPw('Reception@123'), role: 'RECEPTIONIST', first_name: 'Anjali', last_name: 'Verma', phone: '+91-9000000004' },
  });

  await prisma.user.upsert({
    where: { email: 'nurse@curahospital.in' },
    update: {},
    create: { branch_id: branch.id, email: 'nurse@curahospital.in', password: await hashPw('Nurse@123'), role: 'NURSE', first_name: 'Meena', last_name: 'Kumar', phone: '+91-9000000010' },
  });

  await prisma.user.upsert({
    where: { email: 'pharmacist@curahospital.in' },
    update: {},
    create: { branch_id: branch.id, email: 'pharmacist@curahospital.in', password: await hashPw('Pharmacy@123'), role: 'PHARMACY', first_name: 'Rajan', last_name: 'Gupta', phone: '+91-9000000011' },
  });

  await prisma.user.upsert({
    where: { email: 'lab@curahospital.in' },
    update: {},
    create: { branch_id: branch.id, email: 'lab@curahospital.in', password: await hashPw('Lab@1234'), role: 'LAB_TECHNICIAN', first_name: 'Neha', last_name: 'Joshi', phone: '+91-9000000012' },
  });

  // Doctors
  const doctorUsers = [
    { email: 'dr.arun@curahospital.in', first_name: 'Arun', last_name: 'Patel', specialization: 'Cardiologist', dept: 'Cardiology', license: 'MCI-12345', fee: 800 },
    { email: 'dr.sunita@curahospital.in', first_name: 'Sunita', last_name: 'Rao', specialization: 'Neurologist', dept: 'Neurology', license: 'MCI-12346', fee: 900 },
    { email: 'dr.vikram@curahospital.in', first_name: 'Vikram', last_name: 'Singh', specialization: 'Orthopedic Surgeon', dept: 'Orthopedics', license: 'MCI-12347', fee: 1000 },
    { email: 'dr.kavya@curahospital.in', first_name: 'Kavya', last_name: 'Nair', specialization: 'Pediatrician', dept: 'Pediatrics', license: 'MCI-12348', fee: 700 },
  ];

  for (const du of doctorUsers) {
    const existingUser = await prisma.user.findUnique({ where: { email: du.email } });
    if (!existingUser) {
      const user = await prisma.user.create({
        data: { branch_id: branch.id, email: du.email, password: await hashPw('Doctor@123'), role: 'DOCTOR', first_name: du.first_name, last_name: du.last_name, phone: `+91-9001${Math.floor(10000 + Math.random() * 90000)}`, specialization: du.specialization },
      });
      const existingDoctor = await prisma.doctor.findUnique({ where: { license_no: du.license } });
      if (!existingDoctor) {
        await prisma.doctor.create({
          data: {
            user_id: user.id,
            dept_id: departments[du.dept],
            specialization: du.specialization,
            qualification: 'MD, MBBS',
            experience_years: 10,
            license_no: du.license,
            consultation_fee: du.fee,
            schedule: { monday: { start: '09:00', end: '13:00', slot_duration: 15 }, tuesday: { start: '09:00', end: '13:00', slot_duration: 15 }, wednesday: { start: '14:00', end: '18:00', slot_duration: 15 }, thursday: { start: '09:00', end: '13:00', slot_duration: 15 }, friday: { start: '09:00', end: '13:00', slot_duration: 15 }, saturday: { start: '09:00', end: '12:00', slot_duration: 15 } },
          },
        });
      }
    }
  }
  console.log('✅  Users & Doctors created');

  // ─── Wards & Beds ──────────────────────────────────────────────────────────
  const wardData = [
    { name: 'General Ward A', type: 'GENERAL' as const, total_beds: 20, charge_per_day: 1500 },
    { name: 'Private Suite', type: 'PRIVATE' as const, total_beds: 10, charge_per_day: 5000 },
    { name: 'ICU', type: 'ICU' as const, total_beds: 8, charge_per_day: 15000 },
    { name: 'Emergency Ward', type: 'EMERGENCY' as const, total_beds: 5, charge_per_day: 2000 },
  ];

  for (const w of wardData) {
    const existing = await prisma.ward.findFirst({ where: { branch_id: branch.id, name: w.name } });
    if (!existing) {
      const ward = await prisma.ward.create({ data: { branch_id: branch.id, ...w, available_beds: w.total_beds } });
      for (let i = 1; i <= w.total_beds; i++) {
        await prisma.bed.create({
          data: { ward_id: ward.id, bed_number: `${w.name.charAt(0)}${String(i).padStart(2, '0')}`, type: w.type === 'ICU' ? 'icu' : 'standard', charge_per_day: w.charge_per_day },
        });
      }
    }
  }
  console.log('✅  Wards & Beds created');

  // ─── Lab Test Catalog ──────────────────────────────────────────────────────
  const labTests = [
    { test_name: 'Complete Blood Count', test_code: 'CBC', category: 'Hematology', base_price: 350, parameters: [{ name: 'Hemoglobin', unit: 'g/dL', normal_range_min: '12', normal_range_max: '17' }, { name: 'WBC Count', unit: 'cells/μL', normal_range_min: '4000', normal_range_max: '11000' }, { name: 'Platelet Count', unit: 'cells/μL', normal_range_min: '150000', normal_range_max: '400000' }] },
    { test_name: 'Blood Glucose Fasting', test_code: 'BGF', category: 'Biochemistry', base_price: 150, parameters: [{ name: 'Glucose', unit: 'mg/dL', normal_range_min: '70', normal_range_max: '100' }] },
    { test_name: 'Lipid Profile', test_code: 'LIPID', category: 'Biochemistry', base_price: 600, parameters: [{ name: 'Total Cholesterol', unit: 'mg/dL', normal_range_min: '0', normal_range_max: '200' }, { name: 'LDL', unit: 'mg/dL', normal_range_min: '0', normal_range_max: '100' }, { name: 'HDL', unit: 'mg/dL', normal_range_min: '40', normal_range_max: '60' }] },
    { test_name: 'Thyroid Function Test', test_code: 'TFT', category: 'Endocrinology', base_price: 800, parameters: [{ name: 'TSH', unit: 'mIU/L', normal_range_min: '0.4', normal_range_max: '4.0' }, { name: 'T3', unit: 'ng/dL', normal_range_min: '80', normal_range_max: '200' }] },
    { test_name: 'Urine Routine', test_code: 'UR', category: 'Urinalysis', base_price: 100, parameters: [{ name: 'pH', unit: '', normal_range_min: '4.5', normal_range_max: '8.0' }] },
  ];

  for (const lt of labTests) {
    const existing = await prisma.labTest.findUnique({ where: { test_code: lt.test_code } });
    if (!existing) {
      await prisma.labTest.create({ data: { test_name: lt.test_name, test_code: lt.test_code, category: lt.category, base_price: lt.base_price, parameters: { createMany: { data: lt.parameters } } } });
    }
  }
  console.log('✅  Lab test catalog created');

  // ─── Medicines ─────────────────────────────────────────────────────────────
  const medicines = [
    { name: 'Paracetamol 500mg', generic_name: 'Paracetamol', category: 'Analgesic', dosage_form: 'tablet', strength: '500mg', stock_quantity: 5000, selling_price: 2, purchase_price: 1 },
    { name: 'Amoxicillin 250mg', generic_name: 'Amoxicillin', category: 'Antibiotic', dosage_form: 'capsule', strength: '250mg', stock_quantity: 2000, selling_price: 8, purchase_price: 5 },
    { name: 'Metformin 500mg', generic_name: 'Metformin HCl', category: 'Antidiabetic', dosage_form: 'tablet', strength: '500mg', stock_quantity: 3000, selling_price: 5, purchase_price: 3 },
    { name: 'Omeprazole 20mg', generic_name: 'Omeprazole', category: 'Antacid', dosage_form: 'capsule', strength: '20mg', stock_quantity: 2500, selling_price: 6, purchase_price: 4 },
    { name: 'Normal Saline 500ml', generic_name: 'Sodium Chloride', category: 'IV Fluid', dosage_form: 'injection', strength: '0.9%', stock_quantity: 500, selling_price: 45, purchase_price: 30 },
  ];

  for (const med of medicines) {
    const existing = await prisma.medicine.findFirst({ where: { branch_id: branch.id, name: med.name } });
    if (!existing) {
      await prisma.medicine.create({ data: { branch_id: branch.id, ...med } });
    }
  }
  console.log('✅  Medicines created');

  // ─── Inventory Items & Batches ─────────────────────────────────────────────
  const inventoryItems = [
    { item_name: 'Surgical Gloves (Box)', item_type: 'CONSUMABLE' as const, low_stock_threshold: 10 },
    { item_name: 'Syringe 5ml', item_type: 'CONSUMABLE' as const, low_stock_threshold: 100 },
    { item_name: 'IV Cannula 22G', item_type: 'CONSUMABLE' as const, low_stock_threshold: 50 },
  ];

  for (const item of inventoryItems) {
    const existing = await prisma.inventoryItem.findFirst({ where: { item_name: item.item_name } });
    if (!existing) {
      const inv = await prisma.inventoryItem.create({ data: { branch_id: branch.id, ...item } });
      await prisma.itemBatch.create({ data: { item_id: inv.id, batch_number: `B${Date.now()}`, expiry_date: new Date(Date.now() + 365 * 86400000), mrp: 100, cost_price: 70, current_quantity: 200 } });
    }
  }
  console.log('✅  Inventory items created');

  // ─── Insurance Providers ───────────────────────────────────────────────────
  const providers = [
    { name: 'Star Health Insurance', contact_details: { phone: '1800-425-2255', email: 'support@starhealth.in' } },
    { name: 'HDFC ERGO Health', contact_details: { phone: '1800-266-0700', email: 'health@hdfcergo.com' } },
    { name: 'Government CGHS', contact_details: { phone: '1800-11-0100', email: 'dghs@nic.in' } },
  ];

  for (const p of providers) {
    const existing = await prisma.insuranceProvider.findFirst({ where: { name: p.name } });
    if (!existing) await prisma.insuranceProvider.create({ data: p });
  }
  console.log('✅  Insurance providers created');

  // ─── Blood Inventory ───────────────────────────────────────────────────────
  const bloodGroups = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'] as const;
  for (const bg of bloodGroups) {
    await prisma.bloodInventory.upsert({
      where: { branch_id_blood_group: { branch_id: branch.id, blood_group: bg } },
      update: {},
      create: { branch_id: branch.id, blood_group: bg, units_available: Math.floor(Math.random() * 10 + 2) },
    });
  }
  console.log('✅  Blood inventory seeded');

  // ─── Sample Patients ───────────────────────────────────────────────────────
  const samplePatients = [
    { first_name: 'Ramesh', last_name: 'Sharma', phone: '9876543001', gender: 'MALE' as const, blood_group: 'O_POS' as const, dob: new Date('1975-03-15') },
    { first_name: 'Sunita', last_name: 'Patel', phone: '9876543002', gender: 'FEMALE' as const, blood_group: 'A_POS' as const, dob: new Date('1985-07-22') },
    { first_name: 'Arjun', last_name: 'Kumar', phone: '9876543003', gender: 'MALE' as const, blood_group: 'B_NEG' as const, dob: new Date('1990-11-10') },
  ];

  for (let i = 0; i < samplePatients.length; i++) {
    const p = samplePatients[i];
    const uhid = `CURA-${String(i + 1001).padStart(6, '0')}`;
    const existing = await prisma.patient.findFirst({ where: { phone: p.phone } });
    if (!existing) {
      await prisma.patient.create({
        data: { branch_id: branch.id, uhid, ...p, emergency_contact: { name: 'Emergency Contact', phone: '9999999999', relation: 'Spouse' } },
      });
    }
  }
  console.log('✅  Sample patients created');

  console.log('\n🎉  Database seeded successfully!');
  console.log('\n📋  Login credentials:');
  console.log('   Super Admin  : superadmin@curahospital.in / SuperAdmin@123');
  console.log('   Founder      : founder@curahospital.in / Founder@123');
  console.log('   Branch Admin : branchadmin@curahospital.in / Admin@123');
  console.log('   Doctor       : dr.arun@curahospital.in / Doctor@123');
  console.log('   Nurse        : nurse@curahospital.in / Nurse@123');
  console.log('   Receptionist : reception@curahospital.in / Reception@123');
  console.log('   Pharmacist   : pharmacist@curahospital.in / Pharmacy@123');
  console.log('   Lab Tech     : lab@curahospital.in / Lab@1234');
}

main()
  .catch((e) => { console.error('❌  Seed error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
