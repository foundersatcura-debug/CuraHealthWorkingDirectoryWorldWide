import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding Qura Healthcare database...');

  // ─── Hospital ──────────────────────────────────────────────────────────────
  const hospital = await prisma.hospital.upsert({
    where: { code: 'QURA-001' },
    update: {},
    create: {
      name: 'Qura General Hospital',
      code: 'QURA-001',
      description: 'A leading multi-specialty hospital providing world-class healthcare.',
      phone: '+91-9876543210',
      email: 'admin@qurahospital.in',
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

  // ─── Main Branch ───────────────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { hospital_id_code: { hospital_id: hospital.id, code: 'MAIN' } },
    update: {},
    create: {
      hospital_id: hospital.id,
      name: 'Main Branch',
      code: 'MAIN',
      type: 'main',
      phone: '+91-9876543210',
      email: 'main@qurahospital.in',
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
  console.log('✅  Main branch created:', branch.name);

  // ─── South Branch ──────────────────────────────────────────────────────────
  const branchSouth = await prisma.branch.upsert({
    where: { hospital_id_code: { hospital_id: hospital.id, code: 'SOUTH' } },
    update: {},
    create: {
      hospital_id: hospital.id,
      name: 'South Branch',
      code: 'SOUTH',
      type: 'branch',
      phone: '+91-9876543299',
      email: 'south@qurahospital.in',
      timing: { open: '09:00', close: '21:00', days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] },
      address: {
        line1: '45, South Market Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400022',
        country: 'India',
      },
    },
  });
  console.log('✅  South branch created:', branchSouth.name);

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
        dental: true,
      },
      branding: { name: 'Qura Healthcare', primaryColor: '#2563EB', logo: null },
    },
  });

  // ─── Departments ───────────────────────────────────────────────────────────
  const deptNames = [
    'Cardiology', 'Radiology', 'Orthopedics', 'Neurology',
    'Pediatrics', 'Gynecology', 'General Medicine', 'Emergency',
    'Dental', 'Dermatology', 'ENT', 'Ophthalmology',
  ];
  const departments: Record<string, string> = {};

  for (const name of deptNames) {
    const dept = await prisma.department.upsert({
      where: { branch_id_name: { branch_id: branch.id, name } },
      update: {},
      create: {
        branch_id: branch.id,
        name,
        description: `${name} department`,
        floor: name === 'Emergency' ? 'Ground' : name === 'ICU' ? '2nd' : '1st',
      },
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
    { role_name: 'Dentist', permission_json: { view_patients: true, prescribe_medicine: true, dental_procedures: true, view_xrays: true } },
  ];

  for (const role of roleData) {
    await prisma.role.upsert({ where: { role_name: role.role_name }, update: {}, create: role });
  }
  console.log('✅  Roles created');

  // ─── Password hash helper ──────────────────────────────────────────────────
  const hashPw = async (pw: string) => bcrypt.hash(pw, 10);

  // ─── System Users ──────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'superadmin@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'superadmin@qurahospital.in',
      password: await hashPw('SuperAdmin@123'), role: 'SUPER_ADMIN',
      first_name: 'Super', last_name: 'Admin', phone: '+91-9000000001',
    },
  });

  await prisma.user.upsert({
    where: { email: 'founder@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'founder@qurahospital.in',
      password: await hashPw('Founder@123'), role: 'FOUNDER',
      first_name: 'Rajesh', last_name: 'Sharma', phone: '+91-9000000002',
    },
  });

  await prisma.user.upsert({
    where: { email: 'branchadmin@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'branchadmin@qurahospital.in',
      password: await hashPw('Admin@123'), role: 'BRANCH_ADMIN',
      first_name: 'Priya', last_name: 'Mehta', phone: '+91-9000000003',
    },
  });

  await prisma.user.upsert({
    where: { email: 'reception@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'reception@qurahospital.in',
      password: await hashPw('Reception@123'), role: 'RECEPTIONIST',
      first_name: 'Anjali', last_name: 'Verma', phone: '+91-9000000004',
    },
  });

  await prisma.user.upsert({
    where: { email: 'reception2@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'reception2@qurahospital.in',
      password: await hashPw('Reception@123'), role: 'RECEPTIONIST',
      first_name: 'Ravi', last_name: 'Sharma', phone: '+91-9000000005',
    },
  });

  await prisma.user.upsert({
    where: { email: 'nurse@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'nurse@qurahospital.in',
      password: await hashPw('Nurse@123'), role: 'NURSE',
      first_name: 'Meena', last_name: 'Kumar', phone: '+91-9000000010',
    },
  });

  await prisma.user.upsert({
    where: { email: 'nurse2@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'nurse2@qurahospital.in',
      password: await hashPw('Nurse@123'), role: 'NURSE',
      first_name: 'Deepa', last_name: 'Pillai', phone: '+91-9000000015',
    },
  });

  await prisma.user.upsert({
    where: { email: 'pharmacist@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'pharmacist@qurahospital.in',
      password: await hashPw('Pharmacy@123'), role: 'PHARMACY',
      first_name: 'Rajan', last_name: 'Gupta', phone: '+91-9000000011',
    },
  });

  await prisma.user.upsert({
    where: { email: 'lab@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'lab@qurahospital.in',
      password: await hashPw('Lab@1234'), role: 'LAB_TECHNICIAN',
      first_name: 'Neha', last_name: 'Joshi', phone: '+91-9000000012',
    },
  });

  await prisma.user.upsert({
    where: { email: 'dental@qurahospital.in' },
    update: {},
    create: {
      branch_id: branch.id, email: 'dental@qurahospital.in',
      password: await hashPw('Dental@123'), role: 'DENTAL',
      first_name: 'Pooja', last_name: 'Iyer', phone: '+91-9000000013',
      specialization: 'Dentist',
    },
  });

  // ─── Doctors ───────────────────────────────────────────────────────────────
  const doctorUsers = [
    { email: 'dr.arun@qurahospital.in', first_name: 'Arun', last_name: 'Patel', specialization: 'Cardiologist', dept: 'Cardiology', license: 'MCI-12345', fee: 800, exp: 12 },
    { email: 'dr.sunita@qurahospital.in', first_name: 'Sunita', last_name: 'Rao', specialization: 'Neurologist', dept: 'Neurology', license: 'MCI-12346', fee: 900, exp: 10 },
    { email: 'dr.vikram@qurahospital.in', first_name: 'Vikram', last_name: 'Singh', specialization: 'Orthopedic Surgeon', dept: 'Orthopedics', license: 'MCI-12347', fee: 1000, exp: 15 },
    { email: 'dr.kavya@qurahospital.in', first_name: 'Kavya', last_name: 'Nair', specialization: 'Pediatrician', dept: 'Pediatrics', license: 'MCI-12348', fee: 700, exp: 8 },
    { email: 'dr.rahul@qurahospital.in', first_name: 'Rahul', last_name: 'Desai', specialization: 'General Physician', dept: 'General Medicine', license: 'MCI-12349', fee: 600, exp: 7 },
    { email: 'dr.priya@qurahospital.in', first_name: 'Priya', last_name: 'Chandrasekhar', specialization: 'Gynecologist', dept: 'Gynecology', license: 'MCI-12350', fee: 850, exp: 11 },
  ];

  const doctorMap: Record<string, { userId: string; doctorId: string }> = {};

  for (const du of doctorUsers) {
    let user = await prisma.user.findUnique({ where: { email: du.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          branch_id: branch.id, email: du.email,
          password: await hashPw('Doctor@123'), role: 'DOCTOR',
          first_name: du.first_name, last_name: du.last_name,
          phone: `+91-90010${Math.floor(10000 + Math.random() * 90000)}`,
          specialization: du.specialization,
        },
      });
    }
    let doctor = await prisma.doctor.findUnique({ where: { user_id: user.id } });
    if (!doctor) {
      const existingByLicense = await prisma.doctor.findUnique({ where: { license_no: du.license } });
      if (!existingByLicense) {
        doctor = await prisma.doctor.create({
          data: {
            user_id: user.id,
            dept_id: departments[du.dept],
            specialization: du.specialization,
            qualification: 'MD, MBBS',
            experience_years: du.exp,
            license_no: du.license,
            consultation_fee: du.fee,
            schedule: {
              monday:    { start: '09:00', end: '13:00', slot_duration: 15 },
              tuesday:   { start: '09:00', end: '13:00', slot_duration: 15 },
              wednesday: { start: '14:00', end: '18:00', slot_duration: 15 },
              thursday:  { start: '09:00', end: '13:00', slot_duration: 15 },
              friday:    { start: '09:00', end: '13:00', slot_duration: 15 },
              saturday:  { start: '09:00', end: '12:00', slot_duration: 15 },
            },
          },
        });
      } else {
        doctor = existingByLicense;
      }
    }
    if (doctor) {
      doctorMap[du.email] = { userId: user.id, doctorId: doctor.id };
    }
  }
  console.log('✅  Users & Doctors created');

  // ─── Wards & Beds ──────────────────────────────────────────────────────────
  const wardData = [
    { name: 'General Ward A', type: 'GENERAL' as const, total_beds: 20, charge_per_day: 1500 },
    { name: 'General Ward B', type: 'GENERAL' as const, total_beds: 20, charge_per_day: 1500 },
    { name: 'Private Suite',  type: 'PRIVATE' as const, total_beds: 10, charge_per_day: 5000 },
    { name: 'ICU',            type: 'ICU' as const,     total_beds: 8,  charge_per_day: 15000 },
    { name: 'NICU',           type: 'NICU' as const,    total_beds: 4,  charge_per_day: 18000 },
    { name: 'Emergency Ward', type: 'EMERGENCY' as const, total_beds: 6, charge_per_day: 2000 },
    { name: 'OT Complex',     type: 'OT' as const,      total_beds: 4,  charge_per_day: 25000 },
  ];

  const wardMap: Record<string, string> = {};
  for (const w of wardData) {
    const existing = await prisma.ward.findFirst({ where: { branch_id: branch.id, name: w.name } });
    if (!existing) {
      const ward = await prisma.ward.create({
        data: { branch_id: branch.id, ...w, available_beds: w.total_beds },
      });
      wardMap[w.name] = ward.id;
      for (let i = 1; i <= w.total_beds; i++) {
        await prisma.bed.create({
          data: {
            ward_id: ward.id,
            bed_number: `${w.name.charAt(0)}${String(i).padStart(2, '0')}`,
            type: w.type === 'ICU' ? 'icu' : w.type === 'PRIVATE' ? 'private' : 'standard',
            charge_per_day: w.charge_per_day,
            features: w.type === 'ICU' ? ['ventilator', 'monitor'] : w.type === 'PRIVATE' ? ['tv', 'ac', 'attached_bathroom'] : [],
          },
        });
      }
    } else {
      wardMap[w.name] = existing.id;
    }
  }
  console.log('✅  Wards & Beds created');

  // ─── Lab Test Catalog ──────────────────────────────────────────────────────
  const labTests = [
    { test_name: 'Complete Blood Count', test_code: 'CBC', category: 'Hematology', base_price: 350,
      parameters: [
        { name: 'Hemoglobin',      unit: 'g/dL',     normal_range_min: '12',     normal_range_max: '17' },
        { name: 'WBC Count',       unit: 'cells/μL', normal_range_min: '4000',   normal_range_max: '11000' },
        { name: 'Platelet Count',  unit: 'cells/μL', normal_range_min: '150000', normal_range_max: '400000' },
        { name: 'RBC Count',       unit: 'million/μL', normal_range_min: '4.5',  normal_range_max: '5.9' },
        { name: 'Hematocrit',      unit: '%',         normal_range_min: '36',     normal_range_max: '50' },
      ],
    },
    { test_name: 'Blood Glucose Fasting', test_code: 'BGF', category: 'Biochemistry', base_price: 150,
      parameters: [{ name: 'Glucose', unit: 'mg/dL', normal_range_min: '70', normal_range_max: '100' }],
    },
    { test_name: 'HbA1c', test_code: 'HBA1C', category: 'Biochemistry', base_price: 450,
      parameters: [{ name: 'HbA1c', unit: '%', normal_range_min: '4', normal_range_max: '5.6' }],
    },
    { test_name: 'Lipid Profile', test_code: 'LIPID', category: 'Biochemistry', base_price: 600,
      parameters: [
        { name: 'Total Cholesterol', unit: 'mg/dL', normal_range_min: '0',   normal_range_max: '200' },
        { name: 'LDL',              unit: 'mg/dL', normal_range_min: '0',   normal_range_max: '100' },
        { name: 'HDL',              unit: 'mg/dL', normal_range_min: '40',  normal_range_max: '60' },
        { name: 'Triglycerides',    unit: 'mg/dL', normal_range_min: '0',   normal_range_max: '150' },
      ],
    },
    { test_name: 'Thyroid Function Test', test_code: 'TFT', category: 'Endocrinology', base_price: 800,
      parameters: [
        { name: 'TSH', unit: 'mIU/L', normal_range_min: '0.4',  normal_range_max: '4.0' },
        { name: 'T3',  unit: 'ng/dL', normal_range_min: '80',   normal_range_max: '200' },
        { name: 'T4',  unit: 'μg/dL', normal_range_min: '5.0',  normal_range_max: '12.0' },
      ],
    },
    { test_name: 'Liver Function Test', test_code: 'LFT', category: 'Biochemistry', base_price: 700,
      parameters: [
        { name: 'ALT',     unit: 'U/L',  normal_range_min: '7',  normal_range_max: '40' },
        { name: 'AST',     unit: 'U/L',  normal_range_min: '10', normal_range_max: '40' },
        { name: 'Bilirubin', unit: 'mg/dL', normal_range_min: '0', normal_range_max: '1.2' },
        { name: 'Albumin', unit: 'g/dL', normal_range_min: '3.5', normal_range_max: '5.0' },
      ],
    },
    { test_name: 'Kidney Function Test', test_code: 'KFT', category: 'Biochemistry', base_price: 500,
      parameters: [
        { name: 'Creatinine',   unit: 'mg/dL', normal_range_min: '0.6', normal_range_max: '1.3' },
        { name: 'Blood Urea',   unit: 'mg/dL', normal_range_min: '7',   normal_range_max: '25' },
        { name: 'Uric Acid',    unit: 'mg/dL', normal_range_min: '2.4', normal_range_max: '7.0' },
      ],
    },
    { test_name: 'Urine Routine', test_code: 'UR', category: 'Urinalysis', base_price: 100,
      parameters: [
        { name: 'pH',       unit: '',       normal_range_min: '4.5', normal_range_max: '8.0' },
        { name: 'Protein',  unit: 'mg/dL',  normal_range_min: '0',   normal_range_max: '14' },
        { name: 'Glucose',  unit: 'mg/dL',  normal_range_min: '0',   normal_range_max: '0' },
      ],
    },
    { test_name: 'COVID-19 RT-PCR', test_code: 'COVID', category: 'Virology', base_price: 900,
      parameters: [{ name: 'SARS-CoV-2', unit: '', normal_range_min: 'Negative', normal_range_max: 'Negative' }],
    },
    { test_name: 'Dengue NS1 Antigen', test_code: 'DENGUE', category: 'Serology', base_price: 600,
      parameters: [{ name: 'NS1 Antigen', unit: '', normal_range_min: 'Negative', normal_range_max: 'Negative' }],
    },
  ];

  const labTestMap: Record<string, string> = {};
  for (const lt of labTests) {
    const existing = await prisma.labTest.findUnique({ where: { test_code: lt.test_code } });
    if (!existing) {
      const created = await prisma.labTest.create({
        data: {
          test_name: lt.test_name, test_code: lt.test_code,
          category: lt.category, base_price: lt.base_price,
          parameters: { createMany: { data: lt.parameters } },
        },
      });
      labTestMap[lt.test_code] = created.id;
    } else {
      labTestMap[lt.test_code] = existing.id;
    }
  }
  console.log('✅  Lab test catalog created');

  // ─── Medicines ─────────────────────────────────────────────────────────────
  const medicines = [
    { name: 'Paracetamol 500mg',   generic_name: 'Paracetamol',       category: 'Analgesic',     dosage_form: 'tablet',    strength: '500mg',  stock_quantity: 5000, selling_price: 2,  purchase_price: 1,  reorder_level: 500 },
    { name: 'Amoxicillin 250mg',   generic_name: 'Amoxicillin',       category: 'Antibiotic',    dosage_form: 'capsule',   strength: '250mg',  stock_quantity: 2000, selling_price: 8,  purchase_price: 5,  reorder_level: 200 },
    { name: 'Metformin 500mg',     generic_name: 'Metformin HCl',     category: 'Antidiabetic',  dosage_form: 'tablet',    strength: '500mg',  stock_quantity: 3000, selling_price: 5,  purchase_price: 3,  reorder_level: 300 },
    { name: 'Omeprazole 20mg',     generic_name: 'Omeprazole',        category: 'Antacid',       dosage_form: 'capsule',   strength: '20mg',   stock_quantity: 2500, selling_price: 6,  purchase_price: 4,  reorder_level: 250 },
    { name: 'Normal Saline 500ml', generic_name: 'Sodium Chloride',   category: 'IV Fluid',      dosage_form: 'injection', strength: '0.9%',   stock_quantity: 500,  selling_price: 45, purchase_price: 30, reorder_level: 50 },
    { name: 'Amlodipine 5mg',      generic_name: 'Amlodipine',        category: 'Antihypertensive', dosage_form: 'tablet', strength: '5mg',   stock_quantity: 2000, selling_price: 7,  purchase_price: 4,  reorder_level: 200 },
    { name: 'Atorvastatin 10mg',   generic_name: 'Atorvastatin',      category: 'Statin',        dosage_form: 'tablet',    strength: '10mg',   stock_quantity: 1500, selling_price: 9,  purchase_price: 5,  reorder_level: 150 },
    { name: 'Azithromycin 500mg',  generic_name: 'Azithromycin',      category: 'Antibiotic',    dosage_form: 'tablet',    strength: '500mg',  stock_quantity: 1000, selling_price: 15, purchase_price: 9,  reorder_level: 100 },
    { name: 'Dolo 650',            generic_name: 'Paracetamol 650mg', category: 'Analgesic',     dosage_form: 'tablet',    strength: '650mg',  stock_quantity: 4000, selling_price: 3,  purchase_price: 1.5, reorder_level: 400 },
    { name: 'Cetirizine 10mg',     generic_name: 'Cetirizine',        category: 'Antihistamine', dosage_form: 'tablet',    strength: '10mg',   stock_quantity: 2000, selling_price: 4,  purchase_price: 2,  reorder_level: 200 },
    { name: 'Pantoprazole 40mg',   generic_name: 'Pantoprazole',      category: 'Antacid',       dosage_form: 'tablet',    strength: '40mg',   stock_quantity: 1800, selling_price: 8,  purchase_price: 5,  reorder_level: 180 },
    { name: 'Insulin Glargine',    generic_name: 'Insulin Glargine',  category: 'Antidiabetic',  dosage_form: 'injection', strength: '100U/ml', stock_quantity: 200, selling_price: 650, purchase_price: 400, reorder_level: 20 },
    { name: 'Clopidogrel 75mg',    generic_name: 'Clopidogrel',       category: 'Antiplatelet',  dosage_form: 'tablet',    strength: '75mg',   stock_quantity: 1200, selling_price: 12, purchase_price: 7,  reorder_level: 120 },
    { name: 'Ibuprofen 400mg',     generic_name: 'Ibuprofen',         category: 'NSAID',         dosage_form: 'tablet',    strength: '400mg',  stock_quantity: 3000, selling_price: 5,  purchase_price: 3,  reorder_level: 300 },
    { name: 'Ondansetron 4mg',     generic_name: 'Ondansetron',       category: 'Antiemetic',    dosage_form: 'tablet',    strength: '4mg',    stock_quantity: 1500, selling_price: 18, purchase_price: 10, reorder_level: 150 },
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
    { item_name: 'Surgical Gloves (Box)',    item_type: 'CONSUMABLE' as const, low_stock_threshold: 10 },
    { item_name: 'Syringe 5ml',             item_type: 'CONSUMABLE' as const, low_stock_threshold: 100 },
    { item_name: 'IV Cannula 22G',          item_type: 'CONSUMABLE' as const, low_stock_threshold: 50 },
    { item_name: 'Surgical Mask (Box)',     item_type: 'CONSUMABLE' as const, low_stock_threshold: 20 },
    { item_name: 'BP Cuff Adult',           item_type: 'EQUIPMENT'  as const, low_stock_threshold: 5 },
    { item_name: 'Suture 2-0 Vicryl',       item_type: 'SURGICAL'   as const, low_stock_threshold: 30 },
    { item_name: 'Gauze Roll 10cm',         item_type: 'CONSUMABLE' as const, low_stock_threshold: 50 },
    { item_name: 'Disposable Apron',        item_type: 'CONSUMABLE' as const, low_stock_threshold: 100 },
  ];

  for (const item of inventoryItems) {
    const existing = await prisma.inventoryItem.findFirst({ where: { item_name: item.item_name } });
    if (!existing) {
      const inv = await prisma.inventoryItem.create({ data: { branch_id: branch.id, ...item } });
      await prisma.itemBatch.create({
        data: {
          item_id: inv.id,
          batch_number: `B${Date.now()}${Math.floor(Math.random() * 1000)}`,
          expiry_date: new Date(Date.now() + 365 * 86400000),
          mrp: 100, cost_price: 70, current_quantity: 200,
        },
      });
    }
  }
  console.log('✅  Inventory items created');

  // ─── Insurance Providers ───────────────────────────────────────────────────
  const providers = [
    { name: 'Star Health Insurance', contact_details: { phone: '1800-425-2255', email: 'support@starhealth.in' } },
    { name: 'HDFC ERGO Health',      contact_details: { phone: '1800-266-0700', email: 'health@hdfcergo.com' } },
    { name: 'Government CGHS',       contact_details: { phone: '1800-11-0100',  email: 'dghs@nic.in' } },
    { name: 'New India Assurance',   contact_details: { phone: '1800-209-1415', email: 'care@newindia.co.in' } },
    { name: 'Bajaj Allianz Health',  contact_details: { phone: '1800-209-5858', email: 'bagic@bajajallianz.co.in' } },
  ];

  for (const p of providers) {
    const existing = await prisma.insuranceProvider.findFirst({ where: { name: p.name } });
    if (!existing) await prisma.insuranceProvider.create({ data: p });
  }
  console.log('✅  Insurance providers created');

  // ─── Blood Inventory ───────────────────────────────────────────────────────
  const bloodGroups = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'] as const;
  const bloodUnits = [8, 4, 12, 3, 6, 2, 15, 5];
  for (let i = 0; i < bloodGroups.length; i++) {
    await prisma.bloodInventory.upsert({
      where: { branch_id_blood_group: { branch_id: branch.id, blood_group: bloodGroups[i] } },
      update: {},
      create: { branch_id: branch.id, blood_group: bloodGroups[i], units_available: bloodUnits[i] },
    });
  }

  // ─── Blood Donations ───────────────────────────────────────────────────────
  const donors = [
    { donor_name: 'Sanjay Mehra',   donor_phone: '9811112222', blood_group: 'O_POS' as const, units: 1 },
    { donor_name: 'Kiran Bose',     donor_phone: '9922223333', blood_group: 'B_POS' as const, units: 1 },
    { donor_name: 'Anita Singh',    donor_phone: '9733334444', blood_group: 'A_NEG' as const, units: 1 },
    { donor_name: 'Deepak Rao',     donor_phone: '9644445555', blood_group: 'AB_POS' as const, units: 1 },
  ];
  for (const d of donors) {
    await prisma.bloodDonation.create({
      data: {
        branch_id: branch.id, donor_name: d.donor_name,
        donor_phone: d.donor_phone, blood_group: d.blood_group,
        units: d.units, expiry_date: new Date(Date.now() + 42 * 86400000),
      },
    });
  }
  console.log('✅  Blood inventory & donations seeded');

  // ─── Ambulances ────────────────────────────────────────────────────────────
  const ambulances = [
    { vehicle_number: 'MH-01-AQ-1001', type: 'ALS', driver_name: 'Ramesh Kumar',  driver_phone: '9800001111', status: 'AVAILABLE' as const },
    { vehicle_number: 'MH-01-AQ-1002', type: 'BLS', driver_name: 'Suresh Yadav',  driver_phone: '9800002222', status: 'AVAILABLE' as const },
    { vehicle_number: 'MH-01-AQ-1003', type: 'BLS', driver_name: 'Mohan Das',     driver_phone: '9800003333', status: 'DISPATCHED' as const },
    { vehicle_number: 'MH-01-AQ-1004', type: 'BLS', driver_name: 'Bharat Sinha',  driver_phone: '9800004444', status: 'MAINTENANCE' as const },
  ];
  for (const amb of ambulances) {
    const existing = await prisma.ambulance.findUnique({ where: { vehicle_number: amb.vehicle_number } });
    if (!existing) {
      await prisma.ambulance.create({ data: { branch_id: branch.id, ...amb } });
    }
  }
  console.log('✅  Ambulances created');

  // ─── Patients ─────────────────────────────────────────────────────────────
  const samplePatients = [
    { first_name: 'Ramesh',    last_name: 'Sharma',    phone: '9876543001', gender: 'MALE' as const,   blood_group: 'O_POS' as const,  dob: new Date('1975-03-15'), age: 49 },
    { first_name: 'Sunita',    last_name: 'Patel',     phone: '9876543002', gender: 'FEMALE' as const, blood_group: 'A_POS' as const,  dob: new Date('1985-07-22'), age: 38 },
    { first_name: 'Arjun',     last_name: 'Kumar',     phone: '9876543003', gender: 'MALE' as const,   blood_group: 'B_NEG' as const,  dob: new Date('1990-11-10'), age: 33 },
    { first_name: 'Priya',     last_name: 'Nair',      phone: '9876543004', gender: 'FEMALE' as const, blood_group: 'AB_POS' as const, dob: new Date('1992-05-18'), age: 32 },
    { first_name: 'Vikram',    last_name: 'Singh',     phone: '9876543005', gender: 'MALE' as const,   blood_group: 'A_NEG' as const,  dob: new Date('1968-09-30'), age: 55 },
    { first_name: 'Kavita',    last_name: 'Mehta',     phone: '9876543006', gender: 'FEMALE' as const, blood_group: 'O_NEG' as const,  dob: new Date('1980-12-05'), age: 43 },
    { first_name: 'Santosh',   last_name: 'Reddy',     phone: '9876543007', gender: 'MALE' as const,   blood_group: 'B_POS' as const,  dob: new Date('1955-04-12'), age: 69 },
    { first_name: 'Deepa',     last_name: 'Krishnan',  phone: '9876543008', gender: 'FEMALE' as const, blood_group: 'AB_NEG' as const, dob: new Date('1995-08-25'), age: 28 },
    { first_name: 'Manish',    last_name: 'Gupta',     phone: '9876543009', gender: 'MALE' as const,   blood_group: 'O_POS' as const,  dob: new Date('1978-01-20'), age: 46 },
    { first_name: 'Rekha',     last_name: 'Verma',     phone: '9876543010', gender: 'FEMALE' as const, blood_group: 'A_POS' as const,  dob: new Date('1987-06-14'), age: 37 },
    { first_name: 'Ajay',      last_name: 'Malhotra',  phone: '9876543011', gender: 'MALE' as const,   blood_group: 'B_POS' as const,  dob: new Date('1972-10-08'), age: 51 },
    { first_name: 'Sneha',     last_name: 'Kulkarni',  phone: '9876543012', gender: 'FEMALE' as const, blood_group: 'O_POS' as const,  dob: new Date('1998-02-28'), age: 26 },
    { first_name: 'Rahul',     last_name: 'Joshi',     phone: '9876543013', gender: 'MALE' as const,   blood_group: 'A_NEG' as const,  dob: new Date('1982-07-15'), age: 42 },
    { first_name: 'Meena',     last_name: 'Iyer',      phone: '9876543014', gender: 'FEMALE' as const, blood_group: 'B_NEG' as const,  dob: new Date('1965-11-20'), age: 58 },
    { first_name: 'Suresh',    last_name: 'Rao',       phone: '9876543015', gender: 'MALE' as const,   blood_group: 'AB_POS' as const, dob: new Date('1960-03-04'), age: 64 },
    { first_name: 'Anita',     last_name: 'Desai',     phone: '9876543016', gender: 'FEMALE' as const, blood_group: 'O_NEG' as const,  dob: new Date('1993-09-12'), age: 30 },
    { first_name: 'Rajesh',    last_name: 'Bose',      phone: '9876543017', gender: 'MALE' as const,   blood_group: 'A_POS' as const,  dob: new Date('1970-05-22'), age: 54 },
    { first_name: 'Lakshmi',   last_name: 'Naidu',     phone: '9876543018', gender: 'FEMALE' as const, blood_group: 'B_POS' as const,  dob: new Date('1989-01-30'), age: 35 },
    { first_name: 'Siddharth', last_name: 'Chatterjee',phone: '9876543019', gender: 'MALE' as const,   blood_group: 'O_POS' as const,  dob: new Date('2001-06-17'), age: 23 },
    { first_name: 'Poonam',    last_name: 'Shah',      phone: '9876543020', gender: 'FEMALE' as const, blood_group: 'AB_POS' as const, dob: new Date('1975-08-09'), age: 49 },
    { first_name: 'Arun',      last_name: 'Pillai',    phone: '9876543021', gender: 'MALE' as const,   blood_group: 'A_NEG' as const,  dob: new Date('1988-04-03'), age: 36 },
    { first_name: 'Gita',      last_name: 'Tiwari',    phone: '9876543022', gender: 'FEMALE' as const, blood_group: 'B_NEG' as const,  dob: new Date('1958-12-25'), age: 65 },
    { first_name: 'Nilesh',    last_name: 'Patil',     phone: '9876543023', gender: 'MALE' as const,   blood_group: 'O_POS' as const,  dob: new Date('1995-03-18'), age: 29 },
    { first_name: 'Varsha',    last_name: 'Dubey',     phone: '9876543024', gender: 'FEMALE' as const, blood_group: 'A_POS' as const,  dob: new Date('1983-07-11'), age: 41 },
    { first_name: 'Mohan',     last_name: 'Sinha',     phone: '9876543025', gender: 'MALE' as const,   blood_group: 'B_POS' as const,  dob: new Date('1952-09-28'), age: 71 },
  ];

  const patientMap: Record<string, string> = {};
  for (let i = 0; i < samplePatients.length; i++) {
    const p = samplePatients[i];
    const uhid = `QURA-${String(i + 1001).padStart(6, '0')}`;
    let patient = await prisma.patient.findFirst({ where: { phone: p.phone } });
    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          branch_id: branch.id, uhid,
          first_name: p.first_name, last_name: p.last_name,
          full_name: `${p.first_name} ${p.last_name}`,
          phone: p.phone, gender: p.gender,
          blood_group: p.blood_group, dob: p.dob, age: p.age,
          email: `${p.first_name.toLowerCase()}.${p.last_name.toLowerCase()}@example.com`,
          address: { line1: 'Mumbai', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', country: 'India' },
          emergency_contact: { name: 'Emergency Contact', phone: '9999999999', relation: 'Spouse' },
        },
      });
    }
    patientMap[p.phone] = patient.id;
  }
  console.log('✅  Patients created:', samplePatients.length);

  // ─── Medical Histories & Allergies ─────────────────────────────────────────
  const medHistories = [
    { phone: '9876543001', conditions: ['Hypertension', 'Diabetes Type 2'] },
    { phone: '9876543005', conditions: ['Coronary Artery Disease'] },
    { phone: '9876543007', conditions: ['COPD', 'Hypertension', 'Diabetes Type 2'] },
    { phone: '9876543009', conditions: ['Hypertension'] },
    { phone: '9876543014', conditions: ['Hypothyroidism', 'Osteoarthritis'] },
    { phone: '9876543015', conditions: ['Diabetes Type 2', 'CKD Stage 3'] },
    { phone: '9876543022', conditions: ['Hypertension', 'Diabetes Type 2', 'Hypothyroidism'] },
    { phone: '9876543025', conditions: ['Heart Failure', 'CKD Stage 4'] },
  ];

  for (const mh of medHistories) {
    const patientId = patientMap[mh.phone];
    if (patientId) {
      for (const cond of mh.conditions) {
        const existing = await prisma.medicalHistory.findFirst({ where: { patient_id: patientId, condition_name: cond } });
        if (!existing) {
          await prisma.medicalHistory.create({
            data: { patient_id: patientId, condition_name: cond, is_active: true },
          });
        }
      }
    }
  }

  const allergies = [
    { phone: '9876543002', allergen: 'Penicillin',   severity: 'HIGH' as const },
    { phone: '9876543006', allergen: 'Sulfonamides', severity: 'CRITICAL' as const },
    { phone: '9876543011', allergen: 'Aspirin',      severity: 'HIGH' as const },
    { phone: '9876543016', allergen: 'Latex',        severity: 'LOW' as const },
  ];

  for (const a of allergies) {
    const patientId = patientMap[a.phone];
    if (patientId) {
      const existing = await prisma.allergy.findFirst({ where: { patient_id: patientId, allergen: a.allergen } });
      if (!existing) {
        await prisma.allergy.create({
          data: { patient_id: patientId, allergen: a.allergen, severity: a.severity },
        });
      }
    }
  }
  console.log('✅  Medical histories & allergies created');

  // ─── Appointments ──────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const firstDoctor = doctorMap['dr.arun@qurahospital.in'];
  const secondDoctor = doctorMap['dr.sunita@qurahospital.in'];
  const thirdDoctor = doctorMap['dr.vikram@qurahospital.in'];
  const fourthDoctor = doctorMap['dr.kavya@qurahospital.in'];
  const fifthDoctor = doctorMap['dr.rahul@qurahospital.in'];

  type AppStatus = 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  type AppType = 'CONSULTATION' | 'FOLLOW_UP' | 'EMERGENCY' | 'PROCEDURE' | 'LAB_VISIT';

  const appointments: Array<{
    patient_phone: string; doctor_email: string; dept: string;
    date: string; time: string; type: AppType; status: AppStatus;
    chief_complaint: string; token: number;
  }> = [
    // Today's appointments (mixed statuses - for active dashboards)
    { patient_phone: '9876543001', doctor_email: 'dr.arun@qurahospital.in',   dept: 'Cardiology',      date: today, time: '09:00', type: 'CONSULTATION', status: 'COMPLETED',   chief_complaint: 'Chest pain and shortness of breath', token: 1 },
    { patient_phone: '9876543002', doctor_email: 'dr.sunita@qurahospital.in', dept: 'Neurology',       date: today, time: '09:15', type: 'CONSULTATION', status: 'COMPLETED',   chief_complaint: 'Persistent headaches', token: 1 },
    { patient_phone: '9876543003', doctor_email: 'dr.vikram@qurahospital.in', dept: 'Orthopedics',     date: today, time: '09:00', type: 'CONSULTATION', status: 'IN_PROGRESS', chief_complaint: 'Knee pain', token: 1 },
    { patient_phone: '9876543004', doctor_email: 'dr.kavya@qurahospital.in',  dept: 'Pediatrics',      date: today, time: '09:15', type: 'CONSULTATION', status: 'IN_PROGRESS', chief_complaint: 'Fever and cough in child', token: 1 },
    { patient_phone: '9876543005', doctor_email: 'dr.arun@qurahospital.in',   dept: 'Cardiology',      date: today, time: '09:30', type: 'FOLLOW_UP',    status: 'WAITING',     chief_complaint: 'Follow-up after angioplasty', token: 2 },
    { patient_phone: '9876543006', doctor_email: 'dr.rahul@qurahospital.in',  dept: 'General Medicine', date: today, time: '09:00', type: 'CONSULTATION', status: 'CONFIRMED',   chief_complaint: 'Fever for 3 days', token: 1 },
    { patient_phone: '9876543007', doctor_email: 'dr.arun@qurahospital.in',   dept: 'Cardiology',      date: today, time: '10:00', type: 'FOLLOW_UP',    status: 'SCHEDULED',   chief_complaint: 'BP monitoring', token: 3 },
    { patient_phone: '9876543008', doctor_email: 'dr.sunita@qurahospital.in', dept: 'Neurology',       date: today, time: '10:00', type: 'CONSULTATION', status: 'SCHEDULED',   chief_complaint: 'Migraine episodes', token: 2 },
    { patient_phone: '9876543009', doctor_email: 'dr.rahul@qurahospital.in',  dept: 'General Medicine', date: today, time: '09:30', type: 'CONSULTATION', status: 'SCHEDULED',   chief_complaint: 'Routine checkup', token: 2 },
    { patient_phone: '9876543010', doctor_email: 'dr.vikram@qurahospital.in', dept: 'Orthopedics',     date: today, time: '10:00', type: 'CONSULTATION', status: 'SCHEDULED',   chief_complaint: 'Lower back pain', token: 2 },
    { patient_phone: '9876543011', doctor_email: 'dr.arun@qurahospital.in',   dept: 'Cardiology',      date: today, time: '10:30', type: 'CONSULTATION', status: 'SCHEDULED',   chief_complaint: 'Palpitations', token: 4 },
    { patient_phone: '9876543012', doctor_email: 'dr.kavya@qurahospital.in',  dept: 'Pediatrics',      date: today, time: '10:00', type: 'CONSULTATION', status: 'SCHEDULED',   chief_complaint: 'Vaccination', token: 2 },
    // Yesterday's completed appointments
    { patient_phone: '9876543013', doctor_email: 'dr.rahul@qurahospital.in',  dept: 'General Medicine', date: yesterday, time: '09:00', type: 'CONSULTATION', status: 'COMPLETED', chief_complaint: 'Cough and cold', token: 1 },
    { patient_phone: '9876543014', doctor_email: 'dr.sunita@qurahospital.in', dept: 'Neurology',       date: yesterday, time: '11:00', type: 'FOLLOW_UP',    status: 'COMPLETED', chief_complaint: 'Thyroid follow-up', token: 2 },
    { patient_phone: '9876543015', doctor_email: 'dr.arun@qurahospital.in',   dept: 'Cardiology',      date: yesterday, time: '10:00', type: 'CONSULTATION', status: 'COMPLETED', chief_complaint: 'ECG review', token: 2 },
    // Tomorrow's scheduled appointments
    { patient_phone: '9876543016', doctor_email: 'dr.priya@qurahospital.in',  dept: 'Gynecology',      date: tomorrow, time: '10:00', type: 'CONSULTATION', status: 'SCHEDULED', chief_complaint: 'Routine gynecology check', token: 1 },
    { patient_phone: '9876543017', doctor_email: 'dr.arun@qurahospital.in',   dept: 'Cardiology',      date: tomorrow, time: '11:00', type: 'FOLLOW_UP',    status: 'SCHEDULED', chief_complaint: 'Post-CABG follow-up', token: 1 },
    { patient_phone: '9876543018', doctor_email: 'dr.vikram@qurahospital.in', dept: 'Orthopedics',     date: tomorrow, time: '09:30', type: 'PROCEDURE',    status: 'SCHEDULED', chief_complaint: 'Joint injection', token: 1 },
  ];

  const appointmentMap: Record<string, string> = {};
  for (const apt of appointments) {
    const patientId = patientMap[apt.patient_phone];
    const docInfo = doctorMap[apt.doctor_email];
    if (!patientId || !docInfo) continue;

    const existing = await prisma.appointment.findFirst({
      where: { patient_id: patientId, doctor_id: docInfo.doctorId, appointment_date: new Date(apt.date) },
    });
    if (!existing) {
      const created = await prisma.appointment.create({
        data: {
          branch_id: branch.id,
          patient_id: patientId,
          doctor_id: docInfo.doctorId,
          dept_id: departments[apt.dept],
          appointment_date: new Date(apt.date),
          appointment_time: apt.time,
          type: apt.type,
          status: apt.status,
          chief_complaint: apt.chief_complaint,
          token_number: apt.token,
        },
      });
      appointmentMap[`${apt.patient_phone}-${apt.date}`] = created.id;
    }
  }
  console.log('✅  Appointments created');

  // ─── Patient Queues (today's active queue) ────────────────────────────────
  const queueEntries = [
    { patient_phone: '9876543006', doctor_email: 'dr.rahul@qurahospital.in',   queue_number: 1, status: 'WAITING' as const, priority: 'NORMAL' as const },
    { patient_phone: '9876543009', doctor_email: 'dr.rahul@qurahospital.in',   queue_number: 2, status: 'WAITING' as const, priority: 'NORMAL' as const },
    { patient_phone: '9876543007', doctor_email: 'dr.arun@qurahospital.in',    queue_number: 3, status: 'WAITING' as const, priority: 'VIP' as const },
    { patient_phone: '9876543003', doctor_email: 'dr.vikram@qurahospital.in',  queue_number: 1, status: 'IN_CONSULTATION' as const, priority: 'NORMAL' as const },
    { patient_phone: '9876543010', doctor_email: 'dr.vikram@qurahospital.in',  queue_number: 2, status: 'WAITING' as const, priority: 'NORMAL' as const },
    { patient_phone: '9876543012', doctor_email: 'dr.kavya@qurahospital.in',   queue_number: 2, status: 'WAITING' as const, priority: 'NORMAL' as const },
    { patient_phone: '9876543008', doctor_email: 'dr.sunita@qurahospital.in',  queue_number: 2, status: 'WAITING' as const, priority: 'NORMAL' as const },
    { patient_phone: '9876543011', doctor_email: 'dr.arun@qurahospital.in',    queue_number: 4, status: 'WAITING' as const, priority: 'NORMAL' as const },
  ];

  for (const qe of queueEntries) {
    const patientId = patientMap[qe.patient_phone];
    const docInfo = doctorMap[qe.doctor_email];
    if (!patientId || !docInfo) continue;
    const existing = await prisma.patientQueue.findFirst({
      where: { patient_id: patientId, doctor_id: docInfo.doctorId, branch_id: branch.id },
    });
    if (!existing) {
      await prisma.patientQueue.create({
        data: {
          patient_id: patientId, doctor_id: docInfo.doctorId,
          branch_id: branch.id, queue_number: qe.queue_number,
          status: qe.status, priority: qe.priority,
        },
      });
    }
  }
  console.log('✅  Patient queues created');

  // ─── Vitals ────────────────────────────────────────────────────────────────
  const vitalsData = [
    { phone: '9876543001', bp: '145/92', hr: 88, temp: 36.8, spo2: 97, weight: 78.5, height: 172, bmi: 26.5 },
    { phone: '9876543002', bp: '118/76', hr: 72, temp: 36.6, spo2: 99, weight: 62.0, height: 163, bmi: 23.3 },
    { phone: '9876543003', bp: '122/80', hr: 76, temp: 37.1, spo2: 98, weight: 85.0, height: 180, bmi: 26.2 },
    { phone: '9876543004', bp: '100/70', hr: 96, temp: 38.5, spo2: 96, weight: 20.0, height: 110, bmi: 16.5 },
    { phone: '9876543005', bp: '155/98', hr: 92, temp: 36.9, spo2: 96, weight: 92.0, height: 175, bmi: 30.0 },
    { phone: '9876543006', bp: '110/72', hr: 84, temp: 38.2, spo2: 98, weight: 60.0, height: 158, bmi: 24.0 },
    { phone: '9876543007', bp: '162/100',hr: 95, temp: 37.0, spo2: 95, weight: 82.0, height: 168, bmi: 29.1 },
    { phone: '9876543008', bp: '112/74', hr: 68, temp: 36.7, spo2: 99, weight: 55.0, height: 161, bmi: 21.2 },
    { phone: '9876543009', bp: '138/88', hr: 82, temp: 37.2, spo2: 97, weight: 88.0, height: 178, bmi: 27.7 },
    { phone: '9876543010', bp: '120/78', hr: 74, temp: 36.5, spo2: 98, weight: 65.0, height: 165, bmi: 23.9 },
  ];

  for (const v of vitalsData) {
    const patientId = patientMap[v.phone];
    if (patientId) {
      await prisma.vitalsHistory.create({
        data: {
          patient_id: patientId,
          blood_pressure: v.bp, heart_rate: v.hr,
          temperature: v.temp, spo2: v.spo2,
          weight: v.weight, height: v.height, bmi: v.bmi,
          recorded_at: new Date(),
          recorded_by: 'Nurse - Meena Kumar',
        },
      });
    }
  }
  console.log('✅  Vitals recorded');

  // ─── IPD Admissions ────────────────────────────────────────────────────────
  const generalWardId = wardMap['General Ward A'] || '';
  const privateId     = wardMap['Private Suite'] || '';
  const icuId         = wardMap['ICU'] || '';

  // Get some bed IDs for admitted patients
  const generalBeds = await prisma.bed.findMany({ where: { ward_id: generalWardId }, take: 5 });
  const privateBeds = await prisma.bed.findMany({ where: { ward_id: privateId }, take: 2 });
  const icuBeds     = await prisma.bed.findMany({ where: { ward_id: icuId }, take: 2 });

  type AdmStatus = 'ADMITTED' | 'DISCHARGED' | 'TRANSFERRED' | 'CRITICAL';
  type AdmType   = 'ELECTIVE' | 'EMERGENCY' | 'TRANSFER';

  const admissions: Array<{
    patient_phone: string; doctor_email: string; ward: string; bedIdx: number;
    admit_date: string; status: AdmStatus; type: AdmType; diagnosis: string;
  }> = [
    { patient_phone: '9876543005', doctor_email: 'dr.arun@qurahospital.in',   ward: 'Private Suite',  bedIdx: 0, admit_date: yesterday, status: 'ADMITTED',  type: 'ELECTIVE',   diagnosis: 'Unstable Angina' },
    { patient_phone: '9876543007', doctor_email: 'dr.arun@qurahospital.in',   ward: 'ICU',            bedIdx: 0, admit_date: yesterday, status: 'CRITICAL',  type: 'EMERGENCY',  diagnosis: 'Hypertensive Emergency' },
    { patient_phone: '9876543015', doctor_email: 'dr.arun@qurahospital.in',   ward: 'General Ward A', bedIdx: 0, admit_date: today,     status: 'ADMITTED',  type: 'ELECTIVE',   diagnosis: 'CKD Evaluation' },
    { patient_phone: '9876543022', doctor_email: 'dr.rahul@qurahospital.in',  ward: 'General Ward A', bedIdx: 1, admit_date: today,     status: 'ADMITTED',  type: 'EMERGENCY',  diagnosis: 'Acute Gastroenteritis' },
    { patient_phone: '9876543025', doctor_email: 'dr.arun@qurahospital.in',   ward: 'ICU',            bedIdx: 1, admit_date: yesterday, status: 'CRITICAL',  type: 'EMERGENCY',  diagnosis: 'Acute Heart Failure' },
  ];

  for (const adm of admissions) {
    const patientId = patientMap[adm.patient_phone];
    const docInfo = doctorMap[adm.doctor_email];
    if (!patientId || !docInfo) continue;

    const existing = await prisma.admission.findFirst({ where: { patient_id: patientId, status: adm.status } });
    if (!existing) {
      let wardId = '';
      let bedId: string | null = null;
      if (adm.ward === 'General Ward A') { wardId = generalWardId; bedId = generalBeds[adm.bedIdx]?.id || null; }
      else if (adm.ward === 'Private Suite') { wardId = privateId; bedId = privateBeds[adm.bedIdx]?.id || null; }
      else if (adm.ward === 'ICU') { wardId = icuId; bedId = icuBeds[adm.bedIdx]?.id || null; }

      const admission = await prisma.admission.create({
        data: {
          patient_id: patientId,
          doctor_id: docInfo.doctorId,
          ward_id: wardId || undefined,
          bed_id: bedId,
          admit_date: new Date(adm.admit_date),
          expected_discharge: new Date(Date.now() + 3 * 86400000),
          admission_type: adm.type,
          primary_diagnosis: adm.diagnosis,
          status: adm.status,
          diet_type: 'regular',
        },
      });

      if (bedId) {
        await prisma.bed.update({
          where: { id: bedId },
          data: { status: 'OCCUPIED', patient_id: patientId, admission_id: admission.id },
        });
      }
    }
  }
  console.log('✅  Admissions created');

  // ─── Medical Records & Prescriptions ──────────────────────────────────────
  const completedAptKeys = [
    '9876543001-' + today, '9876543013-' + yesterday,
    '9876543014-' + yesterday, '9876543015-' + yesterday,
  ];

  const medicineList = await prisma.medicine.findMany({ where: { branch_id: branch.id }, take: 10 });

  for (const key of completedAptKeys) {
    const aptId = appointmentMap[key];
    const patientPhone = key.split('-')[0];
    const patientId = patientMap[patientPhone];
    const docInfo = doctorMap['dr.arun@qurahospital.in'] || doctorMap['dr.rahul@qurahospital.in'];
    if (!aptId || !patientId || !docInfo) continue;

    const existingRecord = await prisma.medicalRecord.findUnique({ where: { appointment_id: aptId } });
    if (!existingRecord) {
      const record = await prisma.medicalRecord.create({
        data: {
          patient_id: patientId, doctor_id: docInfo.doctorId,
          appointment_id: aptId,
          visit_date: new Date(),
          chief_complaint: 'Chest pain',
          history: 'Patient c/o chest pain since 2 days. History of hypertension.',
          examination_findings: 'BP: 145/92, PR: 88/min, Clear lungs',
          diagnoses: { codes: [{ code: 'I10', description: 'Essential hypertension' }] },
          treatment_plan: 'Amlodipine 5mg OD, Lifestyle modification',
          follow_up_date: new Date(Date.now() + 30 * 86400000),
        },
      });

      // Create prescription
      if (medicineList.length > 0) {
        await prisma.prescription.create({
          data: {
            patient_id: patientId, doctor_id: docInfo.doctorId,
            visit_id: aptId, record_id: record.id,
            status: 'DISPENSED',
            items: {
              create: [
                {
                  medicine_id: medicineList[0]?.id,
                  medicine_name: medicineList[0]?.name || 'Paracetamol 500mg',
                  dosage: '500mg', frequency: 'TDS', duration: '5 days',
                  duration_days: 5, route: 'oral',
                  instructions: 'After meals', quantity: 15,
                },
                ...(medicineList[5] ? [{
                  medicine_id: medicineList[5].id,
                  medicine_name: medicineList[5].name,
                  dosage: '5mg', frequency: 'OD', duration: '30 days',
                  duration_days: 30, route: 'oral',
                  instructions: 'In the morning', quantity: 30,
                }] : []),
              ],
            },
          },
        });
      }
    }
  }
  console.log('✅  Medical records & prescriptions created');

  // ─── Lab Orders ────────────────────────────────────────────────────────────
  type LabStatus = 'ORDERED' | 'SAMPLE_COLLECTED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  type LabPriority = 'ROUTINE' | 'URGENT' | 'STAT';

  const labOrders: Array<{
    patient_phone: string; doctor_email: string;
    tests: string[]; status: LabStatus; priority: LabPriority;
  }> = [
    { patient_phone: '9876543001', doctor_email: 'dr.arun@qurahospital.in',   tests: ['CBC', 'LIPID', 'KFT'], status: 'COMPLETED',  priority: 'ROUTINE' },
    { patient_phone: '9876543002', doctor_email: 'dr.sunita@qurahospital.in', tests: ['CBC', 'TFT'],          status: 'COMPLETED',  priority: 'ROUTINE' },
    { patient_phone: '9876543003', doctor_email: 'dr.vikram@qurahospital.in', tests: ['CBC', 'KFT'],          status: 'PROCESSING', priority: 'ROUTINE' },
    { patient_phone: '9876543005', doctor_email: 'dr.arun@qurahospital.in',   tests: ['CBC', 'LIPID', 'LFT', 'KFT'], status: 'SAMPLE_COLLECTED', priority: 'URGENT' },
    { patient_phone: '9876543006', doctor_email: 'dr.rahul@qurahospital.in',  tests: ['CBC', 'DENGUE'],       status: 'ORDERED',    priority: 'URGENT' },
    { patient_phone: '9876543007', doctor_email: 'dr.arun@qurahospital.in',   tests: ['CBC', 'LIPID', 'KFT', 'HBA1C'], status: 'ORDERED', priority: 'STAT' },
    { patient_phone: '9876543009', doctor_email: 'dr.rahul@qurahospital.in',  tests: ['CBC', 'BGF', 'HBA1C'], status: 'ORDERED',    priority: 'ROUTINE' },
    { patient_phone: '9876543013', doctor_email: 'dr.rahul@qurahospital.in',  tests: ['CBC', 'UR'],           status: 'COMPLETED',  priority: 'ROUTINE' },
    { patient_phone: '9876543015', doctor_email: 'dr.arun@qurahospital.in',   tests: ['KFT', 'CBC'],          status: 'PROCESSING', priority: 'URGENT' },
    { patient_phone: '9876543022', doctor_email: 'dr.rahul@qurahospital.in',  tests: ['CBC', 'LFT', 'UR'],    status: 'SAMPLE_COLLECTED', priority: 'ROUTINE' },
  ];

  for (const lo of labOrders) {
    const patientId = patientMap[lo.patient_phone];
    const docInfo = doctorMap[lo.doctor_email];
    if (!patientId || !docInfo) continue;

    const existing = await prisma.labOrder.findFirst({ where: { patient_id: patientId, doctor_id: docInfo.doctorId } });
    if (!existing) {
      const labOrder = await prisma.labOrder.create({
        data: {
          patient_id: patientId, doctor_id: docInfo.doctorId,
          branch_id: branch.id, priority: lo.priority, status: lo.status,
          collected_at: ['SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED'].includes(lo.status) ? new Date() : undefined,
          tests: {
            create: lo.tests.map(code => ({
              test_code: code,
              test_name: labTests.find(t => t.test_code === code)?.test_name || code,
              category: labTests.find(t => t.test_code === code)?.category || 'General',
              price: labTests.find(t => t.test_code === code)?.base_price || 0,
              lab_test_id: labTestMap[code] || undefined,
            })),
          },
        },
      });

      // Add results for completed orders
      if (lo.status === 'COMPLETED') {
        const sampleResults: Record<string, { value: string; unit: string; range: string; abnormal: boolean }[]> = {
          'CBC':    [
            { value: '13.5', unit: 'g/dL',      range: '12-17',       abnormal: false },
            { value: '7800', unit: 'cells/μL',   range: '4000-11000',  abnormal: false },
            { value: '220000', unit: 'cells/μL', range: '150000-400000', abnormal: false },
          ],
          'LIPID':  [
            { value: '210', unit: 'mg/dL', range: '<200',  abnormal: true },
            { value: '130', unit: 'mg/dL', range: '<100',  abnormal: true },
            { value: '42',  unit: 'mg/dL', range: '40-60', abnormal: false },
          ],
          'KFT':    [
            { value: '1.1', unit: 'mg/dL', range: '0.6-1.3', abnormal: false },
            { value: '18',  unit: 'mg/dL', range: '7-25',    abnormal: false },
          ],
          'TFT':    [
            { value: '3.2', unit: 'mIU/L', range: '0.4-4.0', abnormal: false },
            { value: '145', unit: 'ng/dL', range: '80-200',  abnormal: false },
          ],
          'UR':     [
            { value: '6.0', unit: '',      range: '4.5-8.0', abnormal: false },
            { value: 'Nil', unit: 'mg/dL', range: 'Nil',     abnormal: false },
          ],
        };

        for (const testCode of lo.tests) {
          const results = sampleResults[testCode];
          if (results) {
            for (const r of results) {
              await prisma.labResult.create({
                data: {
                  order_id: labOrder.id, test_name: testCode,
                  result_value: r.value, unit: r.unit,
                  reference_range: r.range, is_abnormal: r.abnormal,
                  reported_at: new Date(), reported_by: 'Neha Joshi',
                },
              });
            }
          }
        }
      }
    }
  }
  console.log('✅  Lab orders & results created');

  // ─── Bills ─────────────────────────────────────────────────────────────────
  const billsData: Array<{
    patient_phone: string; items: Array<{ category: string; description: string; qty: number; unit_price: number }>;
    paid_amount: number; status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  }> = [
    {
      patient_phone: '9876543001',
      items: [
        { category: 'Consultation', description: 'Cardiology Consultation',     qty: 1, unit_price: 800 },
        { category: 'Lab',          description: 'CBC + Lipid Profile',          qty: 1, unit_price: 950 },
      ],
      paid_amount: 1750, status: 'PAID',
    },
    {
      patient_phone: '9876543002',
      items: [
        { category: 'Consultation', description: 'Neurology Consultation',      qty: 1, unit_price: 900 },
        { category: 'Lab',          description: 'TFT Panel',                   qty: 1, unit_price: 800 },
      ],
      paid_amount: 900, status: 'PARTIAL',
    },
    {
      patient_phone: '9876543005',
      items: [
        { category: 'IPD',          description: 'Private Suite - 2 days',      qty: 2, unit_price: 5000 },
        { category: 'Consultation', description: 'Cardiology Consultation',     qty: 1, unit_price: 800 },
        { category: 'Procedure',    description: 'ECG',                         qty: 1, unit_price: 500 },
        { category: 'Pharmacy',     description: 'Medicines',                   qty: 1, unit_price: 1200 },
      ],
      paid_amount: 7500, status: 'PARTIAL',
    },
    {
      patient_phone: '9876543013',
      items: [
        { category: 'Consultation', description: 'General Medicine Consultation', qty: 1, unit_price: 600 },
        { category: 'Lab',          description: 'CBC + Urine Routine',           qty: 1, unit_price: 450 },
        { category: 'Pharmacy',     description: 'Antibiotic Course',             qty: 1, unit_price: 350 },
      ],
      paid_amount: 1400, status: 'PAID',
    },
    {
      patient_phone: '9876543007',
      items: [
        { category: 'IPD',          description: 'ICU - 2 days',                qty: 2, unit_price: 15000 },
        { category: 'Consultation', description: 'Cardiology Consultation x2',  qty: 2, unit_price: 800 },
        { category: 'Pharmacy',     description: 'IV medications',               qty: 1, unit_price: 3500 },
        { category: 'Procedure',    description: 'ECG + Echo',                   qty: 1, unit_price: 2500 },
      ],
      paid_amount: 10000, status: 'PARTIAL',
    },
    {
      patient_phone: '9876543015',
      items: [
        { category: 'Consultation', description: 'Nephrology Consultation',     qty: 1, unit_price: 900 },
        { category: 'Lab',          description: 'KFT + CBC',                   qty: 1, unit_price: 850 },
      ],
      paid_amount: 0, status: 'PENDING',
    },
  ];

  let billCounter = 1;
  for (const bd of billsData) {
    const patientId = patientMap[bd.patient_phone];
    if (!patientId) continue;

    const existing = await prisma.bill.findFirst({ where: { patient_id: patientId } });
    if (!existing) {
      const subtotal = bd.items.reduce((sum, item) => sum + item.unit_price * item.qty, 0);
      const tax = Math.round(subtotal * 0.05);
      const total = subtotal + tax;
      const balance = Math.max(0, total - bd.paid_amount);

      const bill = await prisma.bill.create({
        data: {
          bill_number: `QURA-BL-${new Date().getFullYear()}-${String(billCounter++).padStart(4, '0')}`,
          patient_id: patientId,
          branch_id: branch.id,
          generated_by: 'reception@qurahospital.in',
          subtotal, tax, total,
          paid_amount: bd.paid_amount,
          balance, status: bd.status,
          items: {
            create: bd.items.map(item => ({
              category: item.category, description: item.description,
              quantity: item.qty, unit_price: item.unit_price,
              discount: 0, amount: item.qty * item.unit_price,
            })),
          },
        },
      });

      if (bd.paid_amount > 0) {
        await prisma.payment.create({
          data: {
            bill_id: bill.id, patient_id: patientId,
            amount: bd.paid_amount, method: 'CASH',
            payment_status: 'SUCCESS',
            received_by: 'Anjali Verma',
          },
        });
      }
    }
  }
  console.log('✅  Bills & payments created');

  // ─── Emergency Cases ────────────────────────────────────────────────────────
  type EmerStatus = 'WAITING' | 'BEING_TREATED' | 'ADMITTED' | 'DISCHARGED' | 'REFERRED' | 'DECEASED';
  type TriLevel = 'IMMEDIATE' | 'URGENT' | 'LESS_URGENT' | 'NON_URGENT';
  type ArrMode = 'WALK_IN' | 'AMBULANCE' | 'REFERRED';

  const emergencyCases: Array<{
    patient_phone?: string; patient_name: string; age: number;
    gender: 'MALE' | 'FEMALE'; triage: TriLevel; complaint: string;
    arrival: ArrMode; status: EmerStatus; doctor_email?: string;
  }> = [
    { patient_phone: '9876543022', patient_name: 'Gita Tiwari',      age: 65, gender: 'FEMALE', triage: 'URGENT',      complaint: 'Severe abdominal pain and vomiting', arrival: 'WALK_IN',   status: 'BEING_TREATED', doctor_email: 'dr.rahul@qurahospital.in' },
    { patient_name: 'Mohd. Riyaz',         age: 45, gender: 'MALE',   triage: 'IMMEDIATE',   complaint: 'Chest pain radiating to jaw - suspected MI', arrival: 'AMBULANCE', status: 'BEING_TREATED', doctor_email: 'dr.arun@qurahospital.in' },
    { patient_name: 'Savita Devi',         age: 32, gender: 'FEMALE', triage: 'URGENT',      complaint: 'RTA - Head injury', arrival: 'AMBULANCE', status: 'WAITING' },
    { patient_name: 'Ramu Kaka',           age: 70, gender: 'MALE',   triage: 'LESS_URGENT', complaint: 'Fever and weakness', arrival: 'WALK_IN',   status: 'WAITING' },
    { patient_phone: '9876543007', patient_name: 'Santosh Reddy', age: 69, gender: 'MALE', triage: 'IMMEDIATE', complaint: 'Hypertensive crisis - BP 210/120', arrival: 'AMBULANCE', status: 'ADMITTED', doctor_email: 'dr.arun@qurahospital.in' },
  ];

  for (const ec of emergencyCases) {
    const patientId = ec.patient_phone ? patientMap[ec.patient_phone] : undefined;
    const docInfo = ec.doctor_email ? doctorMap[ec.doctor_email] : undefined;

    await prisma.emergencyCase.create({
      data: {
        branch_id: branch.id,
        patient_id: patientId,
        patient_name: ec.patient_name,
        age: ec.age, gender: ec.gender,
        triage_level: ec.triage,
        chief_complaint: ec.complaint,
        arrival_mode: ec.arrival,
        status: ec.status,
        assigned_doctor_id: docInfo?.doctorId,
        vitals: ec.triage === 'IMMEDIATE'
          ? { bp: '210/120', hr: 110, spo2: 94, temp: 37.2 }
          : { bp: '120/80', hr: 85, spo2: 97, temp: 37.5 },
      },
    });
  }
  console.log('✅  Emergency cases created');

  // ─── Clinical Notes (SOAP) ─────────────────────────────────────────────────
  const aptForNote = appointmentMap['9876543001-' + today];
  if (aptForNote) {
    const existing = await prisma.clinicalNote.findFirst({ where: { appointment_id: aptForNote } });
    if (!existing) {
      await prisma.clinicalNote.create({
        data: {
          appointment_id: aptForNote,
          patient_id: patientMap['9876543001'],
          doctor_id: doctorMap['dr.arun@qurahospital.in']?.doctorId,
          complaints: 'Chest pain and shortness of breath for 2 days. Worse on exertion.',
          diagnosis_notes: 'Hypertensive heart disease with LVH. BP poorly controlled.',
          treatment_plan: 'Amlodipine 5mg OD, Atorvastatin 10mg OD, Salt restriction, Follow-up Echo in 1 month.',
          privacy_level: 'NORMAL',
        },
      });
    }
  }
  console.log('✅  Clinical notes created');

  // ─── Doctor Shifts ─────────────────────────────────────────────────────────
  const shiftDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
  for (const [email, info] of Object.entries(doctorMap)) {
    for (const day of shiftDays) {
      const existing = await prisma.doctorShift.findFirst({
        where: { user_id: info.userId, day_of_week: day },
      });
      if (!existing) {
        await prisma.doctorShift.create({
          data: {
            user_id: info.userId,
            day_of_week: day,
            start_time: '09:00', end_time: '17:00',
            slot_duration_minutes: 15, is_active: true,
          },
        });
      }
    }
  }
  console.log('✅  Doctor shifts created');

  // ─── Notifications ────────────────────────────────────────────────────────
  const superAdminUser = await prisma.user.findUnique({ where: { email: 'superadmin@qurahospital.in' } });
  const nurseUser      = await prisma.user.findUnique({ where: { email: 'nurse@qurahospital.in' } });

  if (superAdminUser) {
    await prisma.notification.createMany({
      data: [
        { user_id: superAdminUser.id, branch_id: branch.id, type: 'alert', title: 'ICU Bed Capacity Warning', message: '2 out of 8 ICU beds occupied, 1 patient in critical condition.', is_read: false },
        { user_id: superAdminUser.id, branch_id: branch.id, type: 'info',  title: 'Monthly Revenue Target', message: 'Current month revenue at ₹4.2L - 68% of target.', is_read: true },
        { user_id: superAdminUser.id, branch_id: branch.id, type: 'alert', title: 'Emergency Case Admitted', message: 'Mohd. Riyaz admitted - suspected MI. Dr. Arun attending.', is_read: false },
      ],
    });
  }

  if (nurseUser) {
    await prisma.notification.createMany({
      data: [
        { user_id: nurseUser.id, branch_id: branch.id, type: 'task', title: 'Vitals Pending - ICU Bed I02', message: 'Patient Santosh Reddy - vitals check overdue by 30 min.', is_read: false },
        { user_id: nurseUser.id, branch_id: branch.id, type: 'task', title: 'Medication Schedule', message: '4 patients due for 14:00 medication round.', is_read: false },
      ],
    });
  }
  console.log('✅  Notifications created');

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n🎉  Qura Healthcare database seeded successfully!');
  console.log('\n📋  Login credentials:');
  console.log('   Super Admin    : superadmin@qurahospital.in / SuperAdmin@123');
  console.log('   Founder        : founder@qurahospital.in / Founder@123');
  console.log('   Branch Admin   : branchadmin@qurahospital.in / Admin@123');
  console.log('   Doctor (Cardio): dr.arun@qurahospital.in / Doctor@123');
  console.log('   Doctor (Neuro) : dr.sunita@qurahospital.in / Doctor@123');
  console.log('   Doctor (Ortho) : dr.vikram@qurahospital.in / Doctor@123');
  console.log('   Doctor (Pedi)  : dr.kavya@qurahospital.in / Doctor@123');
  console.log('   Doctor (GenMed): dr.rahul@qurahospital.in / Doctor@123');
  console.log('   Doctor (Gynae) : dr.priya@qurahospital.in / Doctor@123');
  console.log('   Nurse          : nurse@qurahospital.in / Nurse@123');
  console.log('   Receptionist   : reception@qurahospital.in / Reception@123');
  console.log('   Pharmacist     : pharmacist@qurahospital.in / Pharmacy@123');
  console.log('   Lab Technician : lab@qurahospital.in / Lab@1234');
  console.log('   Dental         : dental@qurahospital.in / Dental@123');
  console.log('\n📊  Data seeded:');
  console.log(`   Hospital       : Qura General Hospital (+ South Branch)`);
  console.log(`   Departments    : ${deptNames.length}`);
  console.log(`   Doctors        : ${doctorUsers.length}`);
  console.log(`   Patients       : ${samplePatients.length}`);
  console.log(`   Appointments   : ${appointments.length}`);
  console.log(`   Medicines      : ${medicines.length}`);
  console.log(`   Lab Tests      : ${labTests.length}`);
  console.log(`   Ambulances     : ${ambulances.length}`);
}

main()
  .catch((e) => { console.error('❌  Seed error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
