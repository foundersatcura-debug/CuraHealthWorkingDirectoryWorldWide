# Cura Healthcare — Entity-Relationship Diagram

> Rendered with Mermaid. Open in VS Code (Mermaid Preview extension), GitHub, or https://mermaid.live

```mermaid
erDiagram

    %% ══════════════════════════════════════════════════════════════════
    %% MULTI-TENANCY
    %% ══════════════════════════════════════════════════════════════════

    HOSPITAL {
        string   id         PK
        string   name
        string   code       UK
        string   phone
        string   email      UK
        string   tax_id
        json     address
        boolean  is_active
        datetime created_at
    }

    BRANCH {
        string   id          PK
        string   hospital_id FK
        string   name
        string   code
        string   type
        string   phone
        string   email
        json     address
        json     timing
        boolean  is_active
    }

    SUBSCRIPTION {
        string   id           PK
        string   hospital_id  FK "UNIQUE"
        enum     plan
        enum     billing_cycle
        int      user_limit
        int      patient_limit
        datetime starts_at
        datetime expires_at
        boolean  is_active
        string   razorpay_sub_id
    }

    HOSPITAL_SETTINGS {
        string   id          PK
        string   hospital_id FK "UNIQUE"
        json     branding
        json     modules_enabled
        json     regional
        json     notifications_config
        json     b2c_config
    }

    %% ══════════════════════════════════════════════════════════════════
    %% AUTH — STAFF
    %% ══════════════════════════════════════════════════════════════════

    ROLE {
        string   id              PK
        string   role_name       UK
        json     permission_json
        datetime created_at
    }

    USER {
        string   id           PK
        string   branch_id    FK
        string   role_id      FK
        string   email        UK
        enum     role
        string   first_name
        string   middle_name
        string   last_name
        string   phone
        string   specialization
        boolean  is_active
        datetime last_login
    }

    REFRESH_TOKEN {
        string   id         PK
        string   user_id    FK
        string   token      UK
        datetime expires_at
        datetime revoked_at
    }

    DOCTOR_SHIFT {
        string   id                    PK
        string   user_id               FK
        date     shift_date
        string   start_time
        string   end_time
        enum     day_of_week
        int      slot_duration_minutes
        boolean  is_active
    }

    %% ══════════════════════════════════════════════════════════════════
    %% AUTH — PATIENTS (B2C)
    %% ══════════════════════════════════════════════════════════════════

    PATIENT_AUTH {
        string   id          PK
        string   patient_id  FK "UNIQUE"
        string   phone       UK
        string   otp
        datetime otp_expires
        boolean  is_verified
    }

    PATIENT_REFRESH_TOKEN {
        string   id              PK
        string   patient_auth_id FK
        string   token           UK
        datetime expires_at
        datetime revoked_at
    }

    %% ══════════════════════════════════════════════════════════════════
    %% PATIENTS
    %% ══════════════════════════════════════════════════════════════════

    PATIENT {
        string   id                PK
        string   branch_id         FK
        string   uhid              UK
        string   first_name
        string   last_name
        date     dob
        int      age
        enum     gender
        enum     blood_group
        string   phone
        string   email
        json     address
        json     emergency_contact
        string   insurance_id
        boolean  is_active
        datetime registered_at
    }

    MEDICAL_HISTORY {
        string   id             PK
        string   patient_id     FK
        string   condition_name
        date     diagnosis_date
        string   notes
        boolean  is_active
    }

    ALLERGY {
        string id         PK
        string patient_id FK
        string allergen
        enum   severity
        string notes
    }

    FAMILY_MEMBER {
        string id           PK
        string head_id      FK
        string member_id    FK
        string relationship
    }

    %% ══════════════════════════════════════════════════════════════════
    %% CLINICAL STAFF
    %% ══════════════════════════════════════════════════════════════════

    DEPARTMENT {
        string   id             PK
        string   branch_id      FK
        string   head_doctor_id FK
        string   name
        string   description
        string   floor
        string   extension
        boolean  is_active
    }

    DOCTOR {
        string  id               PK
        string  user_id          FK "UNIQUE"
        string  dept_id          FK
        string  specialization
        string  qualification
        int     experience_years
        string  license_no       UK
        float   consultation_fee
        boolean is_available
        json    schedule
    }

    STAFF {
        string   id           PK
        string   user_id      FK "UNIQUE"
        string   dept_id
        string   shift
        datetime joining_date
    }

    %% ══════════════════════════════════════════════════════════════════
    %% IPD — WARDS & BEDS
    %% ══════════════════════════════════════════════════════════════════

    WARD {
        string  id             PK
        string  branch_id      FK
        string  dept_id        FK
        string  name
        enum    type
        string  floor
        int     total_beds
        int     available_beds
        float   charge_per_day
        boolean is_active
    }

    BED {
        string   id             PK
        string   ward_id        FK
        string   admission_id   FK
        string   bed_number
        string   type
        enum     status
        string   patient_id
        float    charge_per_day
        string[] features
    }

    ADMISSION {
        string   id                 PK
        string   patient_id         FK
        string   ward_id            FK
        string   doctor_id
        string   bed_id
        datetime admit_date
        datetime discharge_date
        datetime expected_discharge
        enum     admission_type
        string   primary_diagnosis
        enum     status
        string   diet_type
    }

    DISCHARGE_SUMMARY {
        string id                      PK
        string admission_id            FK "UNIQUE"
        string referral_id             FK "UNIQUE"
        string course_in_hospital
        enum   condition_at_discharge
        string final_diagnosis
        string follow_up_advice
        string discharge_medications
    }

    %% ══════════════════════════════════════════════════════════════════
    %% OPD — APPOINTMENTS & QUEUE
    %% ══════════════════════════════════════════════════════════════════

    APPOINTMENT {
        string   id                 PK
        string   branch_id          FK
        string   patient_id         FK
        string   doctor_id          FK
        string   dept_id            FK
        date     appointment_date
        string   appointment_time
        enum     type
        enum     status
        string   chief_complaint
        int      token_number
        string   cancel_reason
        string   source_referral_id
    }

    PATIENT_QUEUE {
        string   id                      PK
        string   visit_id                FK "UNIQUE"
        string   patient_id              FK
        string   doctor_id               FK
        string   branch_id               FK
        int      queue_number
        enum     status
        enum     priority
        datetime check_in_time
        datetime consultation_start_time
        datetime consultation_end_time
    }

    REFERRAL {
        string id                   PK
        string visit_id             FK
        string patient_id           FK
        string referring_doctor_id  FK
        string target_doctor_id     FK
        string target_hospital_name
        enum   referral_type
        enum   urgency
        enum   status
        string reason_for_referral
    }

    %% ══════════════════════════════════════════════════════════════════
    %% CLINICAL RECORDS
    %% ══════════════════════════════════════════════════════════════════

    VITALS_HISTORY {
        string   id             PK
        string   patient_id     FK
        string   appointment_id FK
        string   admission_id   FK
        string   blood_pressure
        int      heart_rate
        float    temperature
        float    spo2
        float    weight
        float    height
        float    bmi
        string   recorded_by
        datetime recorded_at
    }

    CLINICAL_NOTE {
        string id              PK
        string appointment_id  FK
        string admission_id    FK
        string patient_id
        string doctor_id
        string complaints
        string diagnosis_notes
        string treatment_plan
        enum   privacy_level
    }

    MEDICAL_RECORD {
        string   id                   PK
        string   patient_id           FK
        string   doctor_id            FK
        string   appointment_id       FK "UNIQUE"
        string   admission_id         FK
        datetime visit_date
        string   chief_complaint
        json     diagnoses
        string   treatment_plan
        date     follow_up_date
    }

    DOCUMENT_UPLOAD {
        string   id                  PK
        string   patient_id          FK
        string   uploaded_by_user_id FK
        string   visit_id
        string   admission_id
        string   file_url
        string   file_name
        string   file_type
        int      file_size
        enum     tag
        datetime upload_date
    }

    %% ══════════════════════════════════════════════════════════════════
    %% PRESCRIPTIONS
    %% ══════════════════════════════════════════════════════════════════

    PRESCRIPTION {
        string   id                PK
        string   patient_id        FK
        string   doctor_id
        string   record_id         FK
        datetime prescription_date
        enum     status
        datetime dispensed_date
        string   dispensed_by
    }

    PRESCRIPTION_ITEM {
        string id                 PK
        string prescription_id    FK
        string inventory_item_id  FK
        string medicine_id        FK
        string medicine_name
        string dosage
        string frequency
        string duration
        int    duration_days
        int    quantity
        string route
        string instructions
    }

    %% ══════════════════════════════════════════════════════════════════
    %% LABORATORY
    %% ══════════════════════════════════════════════════════════════════

    LAB_TEST {
        string  id              PK
        string  test_code       UK
        string  test_name
        string  category
        float   base_price
        string  reference_range
        boolean is_active
    }

    LAB_PARAMETER {
        string id               PK
        string lab_test_id      FK
        string name
        string unit
        string normal_range_min
        string normal_range_max
    }

    LAB_ORDER {
        string   id             PK
        string   patient_id     FK
        string   doctor_id      FK
        string   branch_id      FK
        string   appointment_id FK
        datetime order_date
        enum     priority
        enum     status
        datetime collected_at
    }

    LAB_TEST_ITEM {
        string id           PK
        string order_id     FK
        string lab_test_id  FK
        string test_code
        string test_name
        string category
        float  price
    }

    LAB_RESULT {
        string   id               PK
        string   order_id         FK
        string   lab_parameter_id FK
        string   test_name
        string   result_value
        string   unit
        string   reference_range
        boolean  is_abnormal
        string   reported_by
        datetime reported_at
    }

    %% ══════════════════════════════════════════════════════════════════
    %% RADIOLOGY
    %% ══════════════════════════════════════════════════════════════════

    RADIOLOGY_REPORT {
        string   id             PK
        string   appointment_id FK
        string   admission_id   FK
        string   patient_id
        string   branch_id
        string   ordered_by
        enum     modality
        string   body_part
        string   clinical_info
        string   findings
        string   impression
        string   image_url
        string   reported_by
        datetime report_date
    }

    %% ══════════════════════════════════════════════════════════════════
    %% PHARMACY & INVENTORY
    %% ══════════════════════════════════════════════════════════════════

    MEDICINE {
        string   id             PK
        string   branch_id      FK
        string   name
        string   generic_name
        string   brand
        string   category
        string   dosage_form
        string   strength
        int      stock_quantity
        int      reorder_level
        float    purchase_price
        float    selling_price
        datetime expiry_date
        string   batch_number
        string   manufacturer
        boolean  is_active
    }

    INVENTORY_ITEM {
        string  id                  PK
        string  branch_id           FK
        string  item_name
        enum    item_type
        int     low_stock_threshold
        string  description
        boolean is_active
    }

    ITEM_BATCH {
        string   id               PK
        string   item_id          FK
        string   batch_number
        datetime expiry_date
        float    mrp
        float    cost_price
        int      current_quantity
    }

    %% ══════════════════════════════════════════════════════════════════
    %% BILLING & PAYMENTS
    %% ══════════════════════════════════════════════════════════════════

    BILL {
        string   id             PK
        string   bill_number    UK
        string   patient_id     FK
        string   admission_id   FK "UNIQUE"
        string   branch_id      FK
        string   generated_by
        datetime bill_date
        datetime due_date
        float    subtotal
        float    discount
        float    tax
        float    total
        float    paid_amount
        float    balance
        enum     status
    }

    BILL_ITEM {
        string id             PK
        string bill_id        FK
        string category
        string description
        int    quantity
        float  unit_price
        float  discount
        float  amount
        string reference_type
        string reference_id
    }

    PAYMENT {
        string   id                     PK
        string   bill_id                FK
        string   patient_id
        float    amount
        enum     method
        enum     payment_status
        datetime payment_date
        string   reference_number
        string   gateway_transaction_id
        string   received_by
        json     gateway_response
    }

    REFUND {
        string   id                PK
        string   payment_id        FK
        string   bill_id           FK
        float    refund_amount
        string   gateway_refund_id
        string   reason
        enum     status
        datetime created_at
    }

    PAYMENT_GATEWAY_LOG {
        string   id         PK
        string   payment_id FK
        string   event_type
        json     payload
        datetime timestamp
    }

    %% ══════════════════════════════════════════════════════════════════
    %% INSURANCE
    %% ══════════════════════════════════════════════════════════════════

    INSURANCE_PROVIDER {
        string  id              PK
        string  name
        json    contact_details
        string  address
        boolean is_active
    }

    INSURANCE_CLAIM {
        string   id              PK
        string   bill_id         FK
        string   provider_id     FK
        string   policy_number
        float    amount_claimed
        float    amount_approved
        enum     claim_status
        datetime submission_date
        datetime approval_date
    }

    %% ══════════════════════════════════════════════════════════════════
    %% EMERGENCY
    %% ══════════════════════════════════════════════════════════════════

    EMERGENCY_CASE {
        string   id                 PK
        string   branch_id          FK
        string   patient_id         FK
        string   assigned_doctor_id FK
        string   patient_name
        int      age
        enum     gender
        enum     triage_level
        string   chief_complaint
        datetime arrival_time
        enum     arrival_mode
        json     vitals
        enum     status
        string   disposition_notes
    }

    %% ══════════════════════════════════════════════════════════════════
    %% BLOOD BANK
    %% ══════════════════════════════════════════════════════════════════

    BLOOD_INVENTORY {
        string id              PK
        string branch_id       FK
        enum   blood_group
        int    units_available
        int    reserved_units
        datetime updated_at
    }

    BLOOD_DONATION {
        string   id           PK
        string   branch_id
        string   donor_name
        string   donor_phone
        enum     blood_group
        float    units
        datetime donation_date
        datetime expiry_date
        string   status
    }

    BLOOD_REQUEST {
        string   id             PK
        string   branch_id
        string   patient_id     FK
        string   doctor_id      FK
        enum     blood_group
        float    units_required
        float    units_issued
        enum     priority
        enum     status
        datetime request_date
        datetime issued_date
    }

    %% ══════════════════════════════════════════════════════════════════
    %% AMBULANCE
    %% ══════════════════════════════════════════════════════════════════

    AMBULANCE {
        string id             PK
        string branch_id      FK
        string vehicle_number UK
        string type
        enum   status
        string driver_name
        string driver_phone
        json   last_location
    }

    %% ══════════════════════════════════════════════════════════════════
    %% NOTIFICATIONS & AUDIT
    %% ══════════════════════════════════════════════════════════════════

    NOTIFICATION {
        string   id         PK
        string   user_id    FK
        string   patient_id FK
        string   branch_id
        string   type
        string   title
        string   message
        json     data
        boolean  is_read
        datetime read_at
        datetime created_at
    }

    AUDIT_LOG {
        string   id          PK
        string   branch_id   FK
        string   user_id     FK
        string   action
        string   resource
        string   resource_id
        json     changes
        string   ip_address
        string   user_agent
        datetime created_at
    }

    %% ══════════════════════════════════════════════════════════════════
    %% RELATIONSHIPS
    %% ══════════════════════════════════════════════════════════════════

    %% ── Multi-tenancy ────────────────────────────────────────────────
    HOSPITAL ||--|{ BRANCH             : "has"
    HOSPITAL ||--o| SUBSCRIPTION       : "subscribes"
    HOSPITAL ||--o| HOSPITAL_SETTINGS  : "configures"

    %% ── Branch → everything ──────────────────────────────────────────
    BRANCH ||--o{ USER             : "employs"
    BRANCH ||--o{ PATIENT          : "registers"
    BRANCH ||--o{ DEPARTMENT       : "has"
    BRANCH ||--o{ WARD             : "has"
    BRANCH ||--o{ MEDICINE         : "stocks"
    BRANCH ||--o{ AMBULANCE        : "operates"
    BRANCH ||--o{ BLOOD_INVENTORY  : "holds"
    BRANCH ||--o{ AUDIT_LOG        : "logs"
    BRANCH ||--o{ PATIENT_QUEUE    : "manages"

    %% ── User / Auth ──────────────────────────────────────────────────
    ROLE     ||--o{ USER          : "grants"
    USER     ||--o{ REFRESH_TOKEN : "owns"
    USER     ||--o{ DOCTOR_SHIFT  : "works"
    USER     ||--o{ AUDIT_LOG     : "performs"
    USER     ||--o{ NOTIFICATION  : "receives"
    USER     ||--o{ DOCUMENT_UPLOAD : "uploads"
    USER     ||--o| DOCTOR        : "is a"
    USER     ||--o| STAFF         : "is a"
    USER     ||--o{ REFERRAL      : "makes (referring)"

    %% ── Patient / Auth ───────────────────────────────────────────────
    PATIENT  ||--o| PATIENT_AUTH          : "authenticates via"
    PATIENT_AUTH ||--o{ PATIENT_REFRESH_TOKEN : "owns"

    %% ── Patient → clinical ───────────────────────────────────────────
    PATIENT  ||--o{ MEDICAL_HISTORY  : "has"
    PATIENT  ||--o{ ALLERGY          : "has"
    PATIENT  ||--o{ APPOINTMENT      : "books"
    PATIENT  ||--o{ MEDICAL_RECORD   : "has"
    PATIENT  ||--o{ ADMISSION        : "admitted via"
    PATIENT  ||--o{ BILL             : "billed"
    PATIENT  ||--o{ LAB_ORDER        : "has"
    PATIENT  ||--o{ EMERGENCY_CASE   : "has"
    PATIENT  ||--o{ BLOOD_REQUEST    : "requests"
    PATIENT  ||--o{ NOTIFICATION     : "receives"
    PATIENT  ||--o{ DOCUMENT_UPLOAD  : "owns"
    PATIENT  ||--o{ REFERRAL         : "referred"
    PATIENT  ||--o{ PATIENT_QUEUE    : "queued"
    PATIENT  ||--o{ VITALS_HISTORY   : "has"
    PATIENT  ||--o{ FAMILY_MEMBER    : "heads"

    %% ── Family (self-reference via join table) ────────────────────────
    FAMILY_MEMBER }o--|| PATIENT : "member is"

    %% ── Doctor / Department ──────────────────────────────────────────
    DEPARTMENT ||--o| DOCTOR         : "headed by"
    DEPARTMENT ||--o{ APPOINTMENT    : "for"
    DEPARTMENT ||--o{ WARD           : "has"
    DOCTOR     }o--o| DEPARTMENT     : "works in"
    DOCTOR     ||--o{ APPOINTMENT    : "conducts"
    DOCTOR     ||--o{ MEDICAL_RECORD : "writes"
    DOCTOR     ||--o{ LAB_ORDER      : "orders"
    DOCTOR     ||--o{ BLOOD_REQUEST  : "requests"
    DOCTOR     ||--o{ EMERGENCY_CASE : "assigned"
    DOCTOR     ||--o{ PATIENT_QUEUE  : "serves"

    %% ── IPD ──────────────────────────────────────────────────────────
    WARD      ||--|{ BED              : "contains"
    BED       }o--o| ADMISSION        : "assigned to"
    ADMISSION ||--o{ VITALS_HISTORY   : "records"
    ADMISSION ||--o{ CLINICAL_NOTE    : "has"
    ADMISSION ||--o{ RADIOLOGY_REPORT : "has"
    ADMISSION ||--o{ MEDICAL_RECORD   : "has"
    ADMISSION ||--o| BILL             : "generates"
    ADMISSION ||--o| DISCHARGE_SUMMARY : "has"

    %% ── OPD ──────────────────────────────────────────────────────────
    APPOINTMENT ||--o| PATIENT_QUEUE    : "queued as"
    APPOINTMENT ||--o{ REFERRAL         : "generates"
    APPOINTMENT ||--o{ VITALS_HISTORY   : "records"
    APPOINTMENT ||--o{ CLINICAL_NOTE    : "has"
    APPOINTMENT ||--o{ RADIOLOGY_REPORT : "has"
    APPOINTMENT ||--o{ LAB_ORDER        : "orders"
    APPOINTMENT ||--o| MEDICAL_RECORD   : "produces"

    %% ── Referral ─────────────────────────────────────────────────────
    REFERRAL ||--o| DISCHARGE_SUMMARY : "linked to"

    %% ── Prescriptions ────────────────────────────────────────────────
    MEDICAL_RECORD   ||--o{ PRESCRIPTION      : "has"
    PRESCRIPTION     ||--|{ PRESCRIPTION_ITEM  : "contains"
    PRESCRIPTION_ITEM }o--o| MEDICINE          : "uses"
    PRESCRIPTION_ITEM }o--o| INVENTORY_ITEM    : "uses"

    %% ── Laboratory ───────────────────────────────────────────────────
    LAB_TEST      ||--o{ LAB_PARAMETER  : "has"
    LAB_TEST      ||--o{ LAB_TEST_ITEM  : "used in"
    LAB_ORDER     ||--|{ LAB_TEST_ITEM  : "contains"
    LAB_ORDER     ||--o{ LAB_RESULT     : "produces"
    LAB_PARAMETER ||--o{ LAB_RESULT     : "measured in"

    %% ── Inventory ────────────────────────────────────────────────────
    INVENTORY_ITEM ||--|{ ITEM_BATCH : "stocked as"

    %% ── Billing ──────────────────────────────────────────────────────
    BILL               ||--|{ BILL_ITEM          : "has"
    BILL               ||--o{ PAYMENT            : "paid via"
    BILL               ||--o{ INSURANCE_CLAIM    : "claimed"
    BILL               ||--o{ REFUND             : "refunded"
    PAYMENT            ||--o{ REFUND             : "triggers"
    PAYMENT            ||--o{ PAYMENT_GATEWAY_LOG : "logged"
    INSURANCE_PROVIDER ||--o{ INSURANCE_CLAIM    : "processes"

    %% ── Emergency ────────────────────────────────────────────────────
    DOCTOR ||--o{ EMERGENCY_CASE : "assigned (ER)"
```

---

## Entity Count

| Domain | Tables |
|--------|--------|
| Multi-tenancy | Hospital, Branch, Subscription, HospitalSettings |
| Auth (Staff) | Role, User, RefreshToken, DoctorShift |
| Auth (Patient) | PatientAuth, PatientRefreshToken |
| Patients | Patient, MedicalHistory, Allergy, FamilyMember |
| Clinical Staff | Department, Doctor, Staff |
| IPD | Ward, Bed, Admission, DischargeSummary |
| OPD | Appointment, PatientQueue, Referral |
| Clinical Records | VitalsHistory, ClinicalNote, MedicalRecord, DocumentUpload |
| Prescriptions | Prescription, PrescriptionItem |
| Laboratory | LabTest, LabParameter, LabOrder, LabTestItem, LabResult |
| Radiology | RadiologyReport |
| Pharmacy/Inventory | Medicine, InventoryItem, ItemBatch |
| Billing | Bill, BillItem, Payment, Refund, PaymentGatewayLog |
| Insurance | InsuranceProvider, InsuranceClaim |
| Emergency | EmergencyCase |
| Blood Bank | BloodInventory, BloodDonation, BloodRequest |
| Ambulance | Ambulance |
| System | Notification, AuditLog |
| **Total** | **50 tables** |

## Cardinality Legend

| Symbol | Meaning |
|--------|---------|
| `\|\|` | Exactly one (mandatory) |
| `o\|` | Zero or one (optional) |
| `\|{` | One or more |
| `o{` | Zero or more |
