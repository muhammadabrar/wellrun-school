/**
 * Full demo workspace for the claimed school: classes, students & families, staff with contracts and
 * payroll, timetable, fee structures with six months of invoices and payments, attendance, admissions
 * pipeline, and a complete exam cycle (monthly tests, mid term, quizzes, marking workflow, results).
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_GRADE_BANDS, SUBJECTS_BY_GRADE } from "@wellrun/shared";
import { ResultsService } from "../src/exams/results.service";
import { ExamSettingsService } from "../src/exams/settings.service";
import type { PrismaService } from "../src/prisma/prisma.service";

type Ctx = {
  prisma: PrismaClient;
  schoolId: string;
  adminId: string;
  campusId: string;
  passwordHash: string;
  address: string;
};

// Deterministic randomness so every seed produces the same school.
let seed = 20260929;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const pad = (n: number, width: number) => String(n).padStart(width, "0");

async function chunked<T>(rows: T[], size: number, write: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
}

const BOYS = ["Ahmed", "Hassan", "Ali", "Usman", "Bilal", "Hamza", "Ibrahim", "Yusuf", "Zain", "Saad", "Abdullah", "Umar", "Rayyan", "Ayaan", "Danish", "Faizan", "Haris", "Moiz", "Shayan", "Talha"];
const GIRLS = ["Fatima", "Zainab", "Maryam", "Hira", "Ayesha", "Aleena", "Hania", "Eman", "Noor", "Sara", "Amna", "Laiba", "Minahil", "Anaya", "Zoya", "Mahnoor", "Iqra", "Rida", "Khadija", "Areeba"];
const SURNAMES = ["Khan", "Siddiqui", "Butt", "Sheikh", "Raza", "Iqbal", "Malik", "Qureshi", "Chaudhry", "Hashmi", "Ansari", "Mirza", "Abbasi", "Farooqui", "Javed", "Aslam"];
const FATHERS = ["Imran", "Kashif", "Tariq", "Naveed", "Asif", "Faisal", "Shahid", "Adnan", "Rizwan", "Waqas", "Junaid", "Khurram", "Salman", "Nadeem", "Omar", "Zubair"];
const AREAS = ["DHA Phase 5", "DHA Phase 6", "Clifton Block 5", "Khayaban-e-Ittehad", "Bath Island", "PECHS Block 2", "Gulshan-e-Iqbal 13-D"];

/** Subjects and periods per week (6 teaching periods × 5 days = 30). */
const WEEKLY: Record<string, Record<string, number>> = {
  primary12: { English: 7, Urdu: 7, Mathematics: 7, Islamiyat: 4, "Social Studies": 5 },
  primary3: { English: 6, Urdu: 6, Mathematics: 6, Science: 5, Islamiyat: 3, "Social Studies": 4 },
  primary4: { English: 6, Urdu: 5, Mathematics: 6, Science: 5, Islamiyat: 3, "Social Studies": 3, Computer: 2 },
  middle: { English: 6, Urdu: 5, Mathematics: 6, Science: 5, Islamiyat: 3, "Pakistan Studies": 3, Computer: 2 },
};
const weeklyFor = (grade: number) => (grade <= 2 ? WEEKLY.primary12 : grade === 3 ? WEEKLY.primary3 : grade === 4 ? WEEKLY.primary4 : WEEKLY.middle);

const TUITION: Record<number, number> = { 1: 14500, 2: 14500, 3: 16000, 4: 16000, 5: 18500, 6: 18500, 7: 21000, 8: 21000 };

export async function seedDemoSchool(ctx: Ctx) {
  const { prisma, schoolId, adminId, campusId, passwordHash } = ctx;
  const today = d(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()));
  console.log("  demo: years, classes, subjects");

  // Years ---------------------------------------------------------------------------------
  const prevYear = await prisma.academicYear.create({ data: { schoolId, name: "2025-26", startsOn: d("2025-04-01"), endsOn: d("2026-03-31"), current: false } });
  const year = await prisma.academicYear.create({ data: { schoolId, name: "2026-27", startsOn: d("2026-04-01"), endsOn: d("2027-03-31"), current: true } });

  // Classes: Grades 1–4 one section, Grades 5–8 two sections. Last year: Grades 1–7, one section each.
  type Cls = { id: string; grade: number; name: string; section: string; yearId: string };
  const classes: Cls[] = [];
  for (let g = 1; g <= 8; g += 1) for (const section of g >= 5 ? ["A", "B"] : ["A"]) classes.push({ id: randomUUID(), grade: g, name: `Grade ${g}`, section, yearId: year.id });
  const prevClasses: Cls[] = [];
  for (let g = 1; g <= 7; g += 1) prevClasses.push({ id: randomUUID(), grade: g, name: `Grade ${g}`, section: "A", yearId: prevYear.id });
  await prisma.class.createMany({ data: [...classes, ...prevClasses].map((c) => ({ id: c.id, schoolId, yearId: c.yearId, campusId, name: c.name, section: c.section })) });

  const subjectNames = [...new Set(Array.from({ length: 8 }, (_, i) => SUBJECTS_BY_GRADE[`Grade ${i + 1}`]).flat())];
  const subjectId = new Map(subjectNames.map((name) => [name, randomUUID()]));
  const codes: Record<string, string> = { English: "ENG", Urdu: "URD", Mathematics: "MTH", Science: "SCI", Islamiyat: "ISL", "Social Studies": "SST", "Pakistan Studies": "PST", Computer: "CMP" };
  await prisma.subject.createMany({ data: subjectNames.map((name) => ({ id: subjectId.get(name)!, schoolId, name, code: codes[name] ?? "" })) });
  const subjectsOf = (grade: number) => Object.keys(weeklyFor(grade));
  await prisma.classSubject.createMany({
    data: [...classes, ...prevClasses].flatMap((c) => subjectsOf(c.grade).map((s) => ({ schoolId, classId: c.id, subjectId: subjectId.get(s)! }))),
  });

  // Staff -----------------------------------------------------------------------------------
  console.log("  demo: staff, contracts, payroll");
  type StaffSeed = { id: string; name: string; title: string; department: string; gender: string; salary: number; subjects: string[]; email?: string; login?: boolean };
  const staff: StaffSeed[] = [
    { id: randomUUID(), name: "Ayesha Rahman", title: "Principal", department: "Administration", gender: "female", salary: 185000, subjects: [], email: "admin@greenfield.school" },
    { id: randomUUID(), name: "Tahir Mehmood", title: "Vice Principal", department: "Administration", gender: "male", salary: 140000, subjects: [] },
    { id: randomUUID(), name: "Shazia Parveen", title: "Accountant", department: "Accounts", gender: "female", salary: 75000, subjects: [] },
    { id: randomUUID(), name: "Arif Hussain", title: "Admin Officer", department: "Administration", gender: "male", salary: 60000, subjects: [] },
    { id: randomUUID(), name: "Farah Noor", title: "English Teacher", department: "Languages", gender: "female", salary: 82000, subjects: ["English"], email: "teacher@greenfield.school", login: true },
    { id: randomUUID(), name: "Sadia Iqbal", title: "English Teacher", department: "Languages", gender: "female", salary: 80000, subjects: ["English"] },
    { id: randomUUID(), name: "Bilal Hussain", title: "Mathematics Teacher", department: "Mathematics", gender: "male", salary: 85000, subjects: ["Mathematics"], email: "maths@greenfield.school", login: true },
    { id: randomUUID(), name: "Kamran Ashraf", title: "Mathematics Teacher", department: "Mathematics", gender: "male", salary: 84000, subjects: ["Mathematics"] },
    { id: randomUUID(), name: "Hina Tariq", title: "Science Teacher", department: "Science", gender: "female", salary: 83000, subjects: ["Science"] },
    { id: randomUUID(), name: "Waqar Ahmed", title: "Science Teacher", department: "Science", gender: "male", salary: 81000, subjects: ["Science"] },
    { id: randomUUID(), name: "Nadia Perveen", title: "Urdu Teacher", department: "Languages", gender: "female", salary: 72000, subjects: ["Urdu"] },
    { id: randomUUID(), name: "Rubina Akhtar", title: "Urdu Teacher", department: "Languages", gender: "female", salary: 72000, subjects: ["Urdu"] },
    { id: randomUUID(), name: "Maulana Abdul Rauf", title: "Islamiyat Teacher", department: "Islamiyat", gender: "male", salary: 68000, subjects: ["Islamiyat"] },
    { id: randomUUID(), name: "Saima Khalid", title: "Pakistan Studies Teacher", department: "Social Sciences", gender: "female", salary: 70000, subjects: ["Pakistan Studies"] },
    { id: randomUUID(), name: "Usman Ghani", title: "Computer Teacher", department: "Computer Science", gender: "male", salary: 78000, subjects: ["Computer"] },
    { id: randomUUID(), name: "Mehwish Ali", title: "Grade 1 Class Teacher", department: "Primary", gender: "female", salary: 62000, subjects: ["English", "Urdu", "Mathematics"], email: "primary@greenfield.school", login: true },
    { id: randomUUID(), name: "Sobia Naz", title: "Grade 2 Class Teacher", department: "Primary", gender: "female", salary: 62000, subjects: ["English", "Urdu", "Mathematics"] },
    { id: randomUUID(), name: "Asma Jabeen", title: "Grade 3 Class Teacher", department: "Primary", gender: "female", salary: 64000, subjects: ["English", "Science", "Mathematics"] },
    { id: randomUUID(), name: "Rabia Anwar", title: "Grade 4 Class Teacher", department: "Primary", gender: "female", salary: 64000, subjects: ["English", "Science", "Mathematics"] },
  ];
  const byName = new Map(staff.map((s) => [s.name, s]));
  const users = staff.filter((s) => s.login).map((s) => ({ id: randomUUID(), email: s.email!, password: passwordHash, name: s.name, role: "TEACHER" as const, schoolId }));
  await prisma.user.createMany({ data: users });
  const userIdByEmail = new Map<string, string>(users.map((u) => [u.email, u.id]));
  userIdByEmail.set("admin@greenfield.school", adminId);
  await prisma.staff.createMany({
    data: staff.map((s, i) => ({
      id: s.id,
      schoolId,
      campusId,
      userId: s.email ? userIdByEmail.get(s.email) ?? null : null,
      employeeNo: `EMP-${pad(i + 1, 3)}`,
      name: s.name,
      cnic: `42101${pad(1000000 + i * 7919, 7)}${i % 10}`,
      gender: s.gender,
      title: s.title,
      department: s.department,
      joinDate: d(`20${pad(12 + (i % 12), 2)}-0${(i % 8) + 1}-01`),
      email: s.email ?? `${s.name.toLowerCase().replace(/[^a-z]+/g, ".")}@greenfield.school`,
      phone: `0321${pad(4500000 + i * 131, 7)}`,
      bankName: pick(["Meezan Bank", "HBL", "UBL", "Bank Alfalah"]),
      bankAccountTitle: s.name,
      bankAccountNo: `0${pad(10203040 + i * 97, 13)}`,
      subjects: s.subjects,
    })),
  });
  await prisma.staffContract.createMany({
    data: staff.map((s) => ({
      schoolId,
      staffId: s.id,
      type: s.title.includes("Class Teacher") && s.salary < 63000 ? ("PROBATION" as const) : ("PERMANENT" as const),
      startDate: d("2025-04-01"),
      basicSalaryPkr: s.salary,
      allowances: [
        { label: "House rent", amountPkr: Math.round(s.salary * 0.2) },
        { label: "Conveyance", amountPkr: 5000 },
      ],
    })),
  });
  const payslips: Prisma.PayslipCreateManyInput[] = [];
  for (const [month, status] of [["08", "PAID"], ["09", "FINALIZED"]] as const) {
    staff.forEach((s, i) => {
      const allowances = [
        { label: "House rent", amountPkr: Math.round(s.salary * 0.2) },
        { label: "Conveyance", amountPkr: 5000 },
      ];
      const deductions = s.salary > 100000 ? [{ label: "Income tax", amountPkr: Math.round(s.salary * 0.05) }] : [];
      const gross = s.salary + allowances.reduce((a, b) => a + b.amountPkr, 0);
      const ded = deductions.reduce((a, b) => a + b.amountPkr, 0);
      payslips.push({
        schoolId,
        staffId: s.id,
        period: `2026-${month}`,
        payslipNo: `PSL-2026-${month}-${pad(i + 1, 4)}`,
        basicPkr: s.salary,
        allowances,
        deductions,
        grossPkr: gross,
        deductionPkr: ded,
        netPkr: gross - ded,
        status,
        paidOn: status === "PAID" ? d("2026-09-01") : null,
        method: status === "PAID" ? "bank" : "",
      });
    });
  }
  await prisma.payslip.createMany({ data: payslips });

  // Who teaches what -----------------------------------------------------------------------------
  const primaryTeacher: Record<number, string> = { 1: "Mehwish Ali", 2: "Sobia Naz", 3: "Asma Jabeen", 4: "Rabia Anwar" };
  const middleTeacher = (grade: number, subject: string) => {
    const lower = grade <= 6;
    switch (subject) {
      case "English": return lower ? "Farah Noor" : "Sadia Iqbal";
      case "Mathematics": return lower ? "Bilal Hussain" : "Kamran Ashraf";
      case "Science": return lower ? "Hina Tariq" : "Waqar Ahmed";
      case "Urdu": return lower ? "Nadia Perveen" : "Rubina Akhtar";
      case "Islamiyat": return "Maulana Abdul Rauf";
      case "Pakistan Studies": return "Saima Khalid";
      default: return "Usman Ghani";
    }
  };
  const teacherFor = (grade: number, subject: string) =>
    byName.get(grade <= 4 ? (subject === "Computer" ? "Usman Ghani" : primaryTeacher[grade]) : middleTeacher(grade, subject))!;

  const assignments: Prisma.TeacherAssignmentCreateManyInput[] = [];
  for (const c of classes) {
    if (c.grade <= 4) {
      assignments.push({ schoolId, staffId: byName.get(primaryTeacher[c.grade])!.id, classId: c.id, subject: "" });
      if (c.grade === 4) assignments.push({ schoolId, staffId: byName.get("Usman Ghani")!.id, classId: c.id, subject: "Computer" });
    } else {
      for (const s of subjectsOf(c.grade)) assignments.push({ schoolId, staffId: teacherFor(c.grade, s).id, classId: c.id, subject: s });
    }
  }
  await prisma.teacherAssignment.createMany({ data: assignments });

  // Timetable: 6 teaching periods + break, Mon–Fri, no teacher double-booked --------------------------------
  console.log("  demo: timetable");
  const periodDefs = [
    { label: "Period 1", startTime: "08:00", endTime: "08:40" },
    { label: "Period 2", startTime: "08:40", endTime: "09:20" },
    { label: "Period 3", startTime: "09:20", endTime: "10:00" },
    { label: "Break", startTime: "10:00", endTime: "10:20", isBreak: true },
    { label: "Period 4", startTime: "10:20", endTime: "11:00" },
    { label: "Period 5", startTime: "11:00", endTime: "11:40" },
    { label: "Period 6", startTime: "11:40", endTime: "12:20" },
  ];
  const periods = periodDefs.map((p, i) => ({ id: randomUUID(), schoolId, sortOrder: i + 1, isBreak: false, ...p }));
  await prisma.timetablePeriod.createMany({ data: periods });
  const teaching = periods.filter((p) => !p.isBreak);
  const remaining = new Map(classes.map((c) => [c.id, { ...weeklyFor(c.grade) }]));
  const lessons: Prisma.TimetableLessonCreateManyInput[] = [];
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    const perDay = new Map<string, Map<string, number>>();
    for (const period of teaching) {
      const busy = new Set<string>();
      // Middle sections first — their subject teachers are the scarce resource.
      for (const c of [...classes].sort((a, b) => b.grade - a.grade)) {
        const left = remaining.get(c.id)!;
        const dayLoad = perDay.get(c.id) ?? new Map<string, number>();
        const options = Object.entries(left)
          .filter(([subject, n]) => n > 0 && !busy.has(teacherFor(c.grade, subject).id) && (dayLoad.get(subject) ?? 0) < 2)
          .sort((a, b) => b[1] - a[1] || (dayLoad.get(a[0]) ?? 0) - (dayLoad.get(b[0]) ?? 0) || rand() - 0.5);
        if (!options.length) continue;
        const [subject] = options[0];
        const teacher = teacherFor(c.grade, subject);
        busy.add(teacher.id);
        left[subject] -= 1;
        dayLoad.set(subject, (dayLoad.get(subject) ?? 0) + 1);
        perDay.set(c.id, dayLoad);
        lessons.push({ schoolId, classId: c.id, periodId: period.id, staffId: teacher.id, weekday, subject });
      }
    }
  }
  await chunked(lessons, 500, (part) => prisma.timetableLesson.createMany({ data: part }));

  // Students & families ----------------------------------------------------------------------------------
  console.log("  demo: students, guardians, enrollments");
  type Stu = { id: string; first: string; last: string; gender: string; cls: Cls; roll: number; ability: number; admissionNo: string; guardianId: string; returning: boolean; sibling: boolean };
  const students: Stu[] = [];
  const guardians: Prisma.GuardianCreateManyInput[] = [];
  const links: { studentId: string; guardianId: string }[] = [];
  let admSeq = 0;
  let prevFamily: { guardianId: string; last: string } | null = null;
  for (const c of classes) {
    const size = c.grade <= 4 ? 12 : 11;
    for (let r = 1; r <= size; r += 1) {
      const girl = rand() < 0.48;
      // Every ~8th child is a younger sibling of someone already admitted.
      const family: { guardianId: string; last: string } | null = prevFamily;
      const sibling: boolean = Boolean(family) && rand() < 0.12;
      const last: string = sibling && family ? family.last : pick(SURNAMES);
      let guardianId: string = sibling && family ? family.guardianId : "";
      if (!guardianId) {
        guardianId = randomUUID();
        const father = `${pick(FATHERS)} ${last}`;
        guardians.push({
          id: guardianId,
          schoolId,
          name: father,
          phone: `03${pick(["00", "21", "33", "45"])}${pad(Math.floor(rand() * 9999999), 7)}`,
          cnic: `42201${pad(Math.floor(rand() * 99999999), 8)}`,
          email: `${father.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
          relation: "Father",
          occupation: pick(["Business", "Engineer", "Doctor", "Banker", "Government service", "Accountant", "Shopkeeper"]),
        });
      }
      const returning = c.grade >= 2 && rand() < 0.9;
      admSeq += 1;
      const s: Stu = {
        id: randomUUID(),
        first: girl ? pick(GIRLS) : pick(BOYS),
        last,
        gender: girl ? "female" : "male",
        cls: c,
        roll: r,
        ability: clamp(between(40, 95) * 0.6 + between(40, 95) * 0.4, 35, 96),
        admissionNo: `ADM-${returning ? 2025 - Math.floor(rand() * 3) : 2026}-${pad(admSeq, 4)}`,
        guardianId,
        returning,
        sibling,
      };
      students.push(s);
      links.push({ studentId: s.id, guardianId });
      prevFamily = { guardianId, last };
    }
  }
  await prisma.guardian.createMany({ data: guardians });
  await prisma.student.createMany({
    data: students.map((s) => ({
      id: s.id,
      schoolId,
      campusId,
      admissionNo: s.admissionNo,
      rollNo: String(s.roll),
      firstName: s.first,
      lastName: s.last,
      gender: s.gender,
      dateOfBirth: d(`${2026 - 6 - s.cls.grade}-${pad(1 + Math.floor(rand() * 12), 2)}-${pad(1 + Math.floor(rand() * 27), 2)}`),
      status: "active",
      admissionDate: s.returning ? d("2026-04-01") : d(`2026-0${3 + Math.floor(rand() * 2)}-${pad(5 + Math.floor(rand() * 20), 2)}`),
      firstAdmissionDate: s.returning ? d(`${s.admissionNo.slice(4, 8)}-04-0${1 + Math.floor(rand() * 8)}`) : d("2026-04-01"),
      extra: { phone: `03${pick(["00", "21", "33"])}${pad(Math.floor(rand() * 9999999), 7)}`, address: `House ${1 + Math.floor(rand() * 180)}, ${pick(AREAS)}, Karachi` },
    })),
  });
  await prisma.studentGuardian.createMany({ data: links, skipDuplicates: true });
  const enrollments: Prisma.EnrollmentCreateManyInput[] = students.map((s) => ({
    schoolId,
    studentId: s.id,
    classId: s.cls.id,
    active: true,
    rollNo: String(s.roll),
    status: "active",
    studentType: s.returning ? "returning" : "new",
  }));
  // Returning students sat the grade below last year.
  const prevRoll = new Map<string, number>();
  const prevStudents: { s: Stu; cls: Cls }[] = [];
  for (const s of students.filter((x) => x.returning)) {
    const cls = prevClasses.find((c) => c.grade === s.cls.grade - 1);
    if (!cls) continue;
    const roll = (prevRoll.get(cls.id) ?? 0) + 1;
    prevRoll.set(cls.id, roll);
    prevStudents.push({ s, cls });
    enrollments.push({ schoolId, studentId: s.id, classId: cls.id, active: false, rollNo: String(roll), status: "promoted", studentType: "returning", endedAt: d("2026-03-31") });
  }
  await chunked(enrollments, 500, (part) => prisma.enrollment.createMany({ data: part }));

  // Attendance: last 25 school days ------------------------------------------------------------------------
  console.log("  demo: attendance");
  const schoolDays: Date[] = [];
  for (let back = 0; schoolDays.length < 25 && back < 60; back += 1) {
    const day = new Date(today.getTime() - back * 86400000);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && day >= d("2026-08-10")) schoolDays.push(day);
  }
  const attendance: Prisma.AttendanceRecordCreateManyInput[] = [];
  for (const s of students) {
    const shaky = s.ability < 55 ? 0.06 : 0;
    for (const day of schoolDays) {
      const r = rand();
      const status = r < 0.03 + shaky ? "ABSENT" : r < 0.06 + shaky ? "LATE" : r < 0.07 + shaky ? "LEAVE" : "PRESENT";
      attendance.push({ schoolId, studentId: s.id, classId: s.cls.id, date: day, status });
    }
  }
  await chunked(attendance, 1000, (part) => prisma.attendanceRecord.createMany({ data: part }));

  // Fees -----------------------------------------------------------------------------------------------------
  console.log("  demo: fee heads, structures, invoices, payments");
  await prisma.schoolFeeSettings.create({
    data: { schoolId, defaultDueDay: 10, receiptHeader: "Cambridge International School · Reg. No. KHI-1998-114", receiptFooter: "Fee once paid is non-refundable. Thank you for your payment." },
  });
  const head = {
    admission: randomUUID(),
    tuition: randomUUID(),
    annual: randomUUID(),
    lab: randomUUID(),
    transport: randomUUID(),
  };
  await prisma.feeHead.createMany({
    data: [
      { id: head.admission, schoolId, name: "Admission fee", code: "ADMISSION_FEE", category: "admission", amountPkr: 25000, frequency: "ONE_TIME", recurring: false, sortOrder: 1 },
      { id: head.tuition, schoolId, name: "Monthly tuition", code: "MONTHLY_TUITION", category: "tuition", amountPkr: 18500, frequency: "MONTHLY", sortOrder: 2 },
      { id: head.annual, schoolId, name: "Annual charges", code: "ANNUAL_CHARGES", category: "annual", amountPkr: 12000, frequency: "ANNUAL", recurring: true, sortOrder: 3 },
      { id: head.lab, schoolId, name: "Computer lab fee", code: "LAB_FEE", category: "tuition", amountPkr: 1500, frequency: "MONTHLY", sortOrder: 4 },
      { id: head.transport, schoolId, name: "Transport", code: "TRANSPORT", category: "transport", amountPkr: 6500, frequency: "MONTHLY", sortOrder: 5 },
    ],
  });
  // Legacy fee items kept in step with heads (admission forms still read them).
  await prisma.feeItem.createMany({
    data: [
      { id: head.admission, schoolId, name: "Admission fee", amountPkr: 25000, enabled: true, sortOrder: 1 },
      { id: head.tuition, schoolId, name: "Monthly tuition", amountPkr: 18500, enabled: true, sortOrder: 2 },
    ],
  });
  const structureByGrade = new Map<number, { id: string; lines: { feeHeadId: string; amount: number; label: string; frequency: string }[] }>();
  for (let g = 1; g <= 8; g += 1) {
    const lines = [
      { feeHeadId: head.tuition, amount: TUITION[g], label: "Monthly tuition", frequency: "MONTHLY" },
      { feeHeadId: head.annual, amount: g <= 4 ? 10000 : 12000, label: "Annual charges", frequency: "ANNUAL" },
      ...(g >= 4 ? [{ feeHeadId: head.lab, amount: 1500, label: "Computer lab fee", frequency: "MONTHLY" }] : []),
    ];
    const id = randomUUID();
    structureByGrade.set(g, { id, lines });
    await prisma.feeStructure.create({
      data: {
        id,
        schoolId,
        campusId,
        academicYearId: year.id,
        name: `Grade ${g} — 2026-27`,
        className: `Grade ${g}`,
        status: "ACTIVE",
        effectiveFrom: d("2026-04-01"),
        items: { create: lines.map((l, i) => ({ feeHeadId: l.feeHeadId, amountPkr: l.amount, sortOrder: i })) },
      },
    });
  }
  await prisma.studentFeeAssignment.createMany({
    data: students.map((s) => ({ schoolId, studentId: s.id, academicYearId: year.id, feeStructureId: structureByGrade.get(s.cls.grade)!.id, effectiveFrom: d("2026-04-01") })),
  });
  const siblingDiscount = await prisma.discount.create({
    data: { schoolId, name: "Sibling discount", type: "PERCENT", value: 10, feeHeadIds: [head.tuition] },
  });
  await prisma.discount.create({ data: { schoolId, name: "Staff child", type: "PERCENT", value: 50, feeHeadIds: [head.tuition] } });
  await prisma.discount.create({ data: { schoolId, name: "Merit scholarship", type: "FIXED", value: 5000, feeHeadIds: [head.tuition] } });
  const discounted = new Set(students.filter((s) => s.sibling).map((s) => s.id));
  await prisma.studentDiscount.createMany({
    data: students.filter((s) => s.sibling).map((s) => ({ schoolId, studentId: s.id, discountId: siblingDiscount.id, name: "Sibling discount", type: "PERCENT" as const, value: 10, feeHeadIds: [head.tuition] })),
  });

  const months = ["04", "05", "06", "07", "08", "09"];
  const invoices: Prisma.InvoiceCreateManyInput[] = [];
  const items: Prisma.InvoiceItemCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const allocations: Prisma.PaymentAllocationCreateManyInput[] = [];
  const receipts: Prisma.ReceiptCreateManyInput[] = [];
  let invSeq = 0;
  let paySeq = 0;
  const lateFamilies = new Set(students.filter(() => rand() < 0.1).map((s) => s.id));
  for (const month of months) {
    for (const s of students) {
      const structure = structureByGrade.get(s.cls.grade)!;
      const lines = structure.lines.filter((l) => l.frequency === "MONTHLY" || (l.frequency === "ANNUAL" && month === "04"));
      const discount = discounted.has(s.id) ? Math.round(TUITION[s.cls.grade] * 0.1) : 0;
      const subtotal = lines.reduce((a, l) => a + l.amount, 0);
      const total = subtotal - discount;
      const invoiceId = randomUUID();
      invSeq += 1;
      const dueOn = d(`2026-${month}-10`);
      const late = lateFamilies.has(s.id);
      let paid = 0;
      if (month <= "07") paid = total;
      else if (month === "08") paid = late ? (rand() < 0.5 ? Math.round(total / 2) : 0) : total;
      else paid = late ? 0 : rand() < 0.6 ? total : 0;
      const status = paid >= total ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : dueOn < today ? "OVERDUE" : "ISSUED";
      invoices.push({
        id: invoiceId,
        schoolId,
        campusId,
        studentId: s.id,
        academicYearId: year.id,
        feeStructureId: structure.id,
        invoiceNumber: `INV-2026-${pad(invSeq, 6)}`,
        billingPeriod: `2026-${month}`,
        issueDate: d(`2026-${month}-01`),
        dueOn,
        dueDate: dueOn,
        subtotalPkr: subtotal,
        discountAmountPkr: discount,
        totalAmountPkr: total,
        amountPkr: total,
        paidAmountPkr: paid,
        balanceAmountPkr: total - paid,
        status,
      });
      lines.forEach((l) => {
        const lineDiscount = l.feeHeadId === head.tuition ? discount : 0;
        items.push({
          invoiceId,
          feeHeadId: l.feeHeadId,
          description: `${l.label} — ${new Date(`2026-${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}`,
          unitAmountPkr: l.amount,
          grossAmountPkr: l.amount,
          discountAmountPkr: lineDiscount,
          netAmountPkr: l.amount - lineDiscount,
        });
      });
      if (paid > 0) {
        paySeq += 1;
        const paymentId = randomUUID();
        const paidOn = d(`2026-${month}-${pad(3 + Math.floor(rand() * 10), 2)}`);
        const method = pick(["cash", "cash", "bank", "online"]);
        payments.push({
          id: paymentId,
          schoolId,
          campusId,
          studentId: s.id,
          invoiceId,
          paymentNumber: `PAY-2026-${pad(paySeq, 6)}`,
          paymentDate: paidOn,
          paidAt: paidOn,
          amountPkr: paid,
          method,
          referenceNumber: method === "cash" ? "" : `TXN${pad(Math.floor(rand() * 99999999), 8)}`,
          collectedById: adminId,
          status: "COMPLETED",
          receiptNo: `REC-2026-${pad(paySeq, 6)}`,
        });
        allocations.push({ paymentId, invoiceId, amountPkr: paid });
        receipts.push({
          schoolId,
          campusId,
          studentId: s.id,
          paymentId,
          receiptNumber: `REC-2026-${pad(paySeq, 6)}`,
          receiptDate: paidOn,
          amountPkr: paid,
          previousBalancePkr: total,
          remainingBalancePkr: total - paid,
          generatedById: adminId,
        });
      }
    }
  }
  await chunked(invoices, 500, (part) => prisma.invoice.createMany({ data: part }));
  await chunked(items, 1000, (part) => prisma.invoiceItem.createMany({ data: part }));
  await chunked(payments, 500, (part) => prisma.payment.createMany({ data: part }));
  await chunked(allocations, 1000, (part) => prisma.paymentAllocation.createMany({ data: part }));
  await chunked(receipts, 500, (part) => prisma.receipt.createMany({ data: part }));

  // Admissions pipeline ---------------------------------------------------------------------------------------
  console.log("  demo: admissions");
  const admissionPlan = await prisma.feePlan.create({ data: { schoolId, yearId: year.id, name: "Admission fee", amountPkr: 25000 } });
  const classByLabel = (grade: number, section = "A") => classes.find((c) => c.grade === grade && c.section === section)!;
  const pipeline = [
    { status: "DRAFT", first: "Bilal", last: "Ahmed", grade: 5 },
    { status: "SUBMITTED", first: "Noor", last: "Fatima", grade: 1 },
    { status: "SUBMITTED", first: "Rayyan", last: "Siddiqui", grade: 3 },
    { status: "UNDER_REVIEW", first: "Yusuf", last: "Malik", grade: 6 },
    { status: "ASSESSMENT_PENDING", first: "Amina", last: "Shah", grade: 5 },
    { status: "ASSESSMENT_PENDING", first: "Taha", last: "Rizvi", grade: 7 },
    { status: "FEE_PENDING", first: "Hamza", last: "Qureshi", grade: 4 },
    { status: "DOCUMENTS_PENDING", first: "Sara", last: "Nadeem", grade: 6 },
    { status: "WAITLISTED", first: "Ibrahim", last: "Ali", grade: 8 },
    { status: "REJECTED", first: "Hina", last: "Rashid", grade: 8 },
  ] as const;
  let appSeq = 0;
  for (const [index, row] of pipeline.entries()) {
    appSeq += 1;
    const guardian = await prisma.guardian.create({
      data: { schoolId, name: `${pick(FATHERS)} ${row.last}`, phone: `0300${pad(7700000 + index * 37, 7)}`, cnic: `61101${pad(1234000 + index, 8)}`, relation: "Father" },
    });
    const target = classByLabel(row.grade);
    const application = await prisma.admissionApplication.create({
      data: {
        schoolId,
        applicationNo: `APP-2026-${pad(appSeq, 6)}`,
        status: row.status,
        firstName: row.first,
        lastName: row.last,
        gender: index % 2 === 0 ? "male" : "female",
        dateOfBirth: d(`${2026 - 6 - row.grade}-0${(index % 9) + 1}-12`),
        cnic: `35202${pad(2000000 + index, 8)}`,
        address: `${pick(AREAS)}, Karachi`,
        yearId: year.id,
        campusId,
        className: target.name,
        section: "A",
        targetClassId: target.id,
        studentType: "new",
        guardianId: guardian.id,
        family: { guardianName: guardian.name, guardianPhone: guardian.phone, guardianRelation: "Father" },
        assessmentMode: row.status === "ASSESSMENT_PENDING" ? "TEST" : "NONE",
        submittedAt: row.status === "DRAFT" ? null : d("2026-09-12"),
        decidedAt: ["REJECTED", "WAITLISTED", "FEE_PENDING", "DOCUMENTS_PENDING"].includes(row.status) ? d("2026-09-20") : null,
        decisionNote: row.status === "REJECTED" ? "No seat available in Grade 8 this term." : row.status === "WAITLISTED" ? "Next in line if a seat opens." : "",
      },
    });
    await prisma.schoolDocument.createMany({
      data: [
        { schoolId, ownerType: "application", ownerId: application.id, kind: "birth_certificate", label: "Birth certificate", required: true, url: index >= 6 ? "https://example.com/docs/birth.pdf" : "" },
        { schoolId, ownerType: "application", ownerId: application.id, kind: "cnic", label: "Parent CNIC copy", required: true, url: index >= 3 ? "https://example.com/docs/cnic.pdf" : "" },
        { schoolId, ownerType: "application", ownerId: application.id, kind: "report_card", label: "Last report card", required: false, url: index >= 7 ? "https://example.com/docs/report.pdf" : "" },
      ],
    });
    if (row.status === "ASSESSMENT_PENDING") {
      await prisma.admissionTestScore.createMany({
        data: [
          { applicationId: application.id, subject: "English", maxMarks: 50, obtainedMarks: 0 },
          { applicationId: application.id, subject: "Mathematics", maxMarks: 50, obtainedMarks: 0 },
        ],
      });
    }
    if (row.status === "FEE_PENDING" || row.status === "DOCUMENTS_PENDING") {
      invSeq += 1;
      await prisma.invoice.create({
        data: {
          schoolId,
          campusId,
          applicationId: application.id,
          academicYearId: year.id,
          feePlanId: admissionPlan.id,
          invoiceNumber: `INV-2026-${pad(invSeq, 6)}`,
          billingPeriod: `ADM-${application.applicationNo}`,
          amountPkr: 25000,
          totalAmountPkr: 25000,
          subtotalPkr: 25000,
          paidAmountPkr: row.status === "FEE_PENDING" ? 0 : 25000,
          balanceAmountPkr: row.status === "FEE_PENDING" ? 25000 : 0,
          status: row.status === "FEE_PENDING" ? "ISSUED" : "PAID",
          dueOn: d("2026-10-05"),
          dueDate: d("2026-10-05"),
          items: { create: [{ description: "Admission fee", unitAmountPkr: 25000, grossAmountPkr: 25000, netAmountPkr: 25000, feeHeadId: head.admission }] },
        },
      });
    }
  }

  // Exams -----------------------------------------------------------------------------------------------------
  console.log("  demo: exams, marks, results");
  await prisma.examSettings.create({
    data: { schoolId, overallPassPct: 33, subjectPassRequired: true, maxFailSubjects: 0, graceMarks: 2, decimals: 1, absentCountsAsZero: true, assessmentWeight: 20, rankMethod: "DENSE", rankScope: "SECTION", showRank: true, atRiskPct: 45 },
  });
  await prisma.gradingScale.create({ data: { schoolId, name: "Standard (A+ to F)", isDefault: true, bands: DEFAULT_GRADE_BANDS } });
  await prisma.gradingScale.create({
    data: {
      schoolId,
      name: "Primary (descriptive)",
      bands: [
        { grade: "Excellent", minPct: 85, gpa: null, remark: "Excellent", isFail: false },
        { grade: "Very good", minPct: 70, gpa: null, remark: "Very good", isFail: false },
        { grade: "Good", minPct: 55, gpa: null, remark: "Good", isFail: false },
        { grade: "Fair", minPct: 40, gpa: null, remark: "Fair", isFail: false },
        { grade: "Needs work", minPct: 0, gpa: null, remark: "Needs more effort", isFail: true },
      ],
    },
  });
  await prisma.reportCardTemplate.createMany({
    data: [
      { schoolId, name: "Standard report card", layout: "CLASSIC", isDefault: true, options: { showRank: true, showGpa: false, showAttendance: true, showRemarks: true, showGradeLegend: true, showBreakdown: true, headerNote: "Cambridge International School", signatures: ["Class teacher", "Principal", "Parent"] } },
      { schoolId, name: "Modern (colour header)", layout: "MODERN", isDefault: false, options: { showRank: false, showGpa: true, showAttendance: true, showRemarks: true, showGradeLegend: true, showBreakdown: true, headerNote: "", signatures: ["Class teacher", "Principal"] } },
    ],
  });
  const term1 = await prisma.term.create({ data: { schoolId, yearId: year.id, name: "Term 1", startsOn: d("2026-04-01"), endsOn: d("2026-09-30"), weight: 40, sortOrder: 0 } });
  const term2 = await prisma.term.create({ data: { schoolId, yearId: year.id, name: "Term 2", startsOn: d("2026-10-01"), endsOn: d("2027-03-31"), weight: 60, sortOrder: 1 } });
  const prevTerm = await prisma.term.create({ data: { schoolId, yearId: prevYear.id, name: "Annual", startsOn: d("2025-04-01"), endsOn: d("2026-03-31"), weight: 100, sortOrder: 0 } });

  const subjectBias = new Map<string, number>();
  for (const s of students) for (const sub of subjectNames) subjectBias.set(`${s.id}:${sub}`, between(-10, 10));
  const scoreFor = (s: Stu, subject: string, maxMarks: number, difficulty = 0) => {
    const pctScore = clamp(s.ability + (subjectBias.get(`${s.id}:${subject}`) ?? 0) + between(-7, 7) - difficulty, 8, 100);
    return Math.round((pctScore / 100) * maxMarks);
  };

  type PaperPlan = { cls: Cls; subject: string; status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED"; note?: string; partial?: boolean };
  const createExam = async (input: {
    name: string;
    kind?: "EXAM" | "QUIZ" | "ASSIGNMENT" | "PRACTICAL" | "VIVA";
    yearId: string;
    termId: string;
    status: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "MARKING" | "COMPLETED" | "PUBLISHED";
    startsOn: string;
    endsOn: string;
    weight: number;
    maxMarks: (grade: number) => number;
    papers: PaperPlan[];
    roster: (cls: Cls) => Stu[];
    dateFor?: (cls: Cls, subject: string, index: number) => string;
    difficulty?: number;
    createdById?: string;
  }) => {
    const examId = randomUUID();
    await prisma.exam.create({
      data: {
        id: examId,
        schoolId,
        yearId: input.yearId,
        termId: input.termId,
        kind: input.kind ?? "EXAM",
        name: input.name,
        status: input.status,
        startsOn: d(input.startsOn),
        endsOn: d(input.endsOn),
        weight: input.weight,
        createdById: input.createdById ?? adminId,
      },
    });
    const paperRows: Prisma.ExamPaperCreateManyInput[] = [];
    const markRows: Prisma.ExamMarkCreateManyInput[] = [];
    const bySubjectIndex = new Map<string, number>();
    for (const p of input.papers) {
      const id = randomUUID();
      const max = input.maxMarks(p.cls.grade);
      const idx = bySubjectIndex.get(`${p.cls.id}`) ?? 0;
      bySubjectIndex.set(p.cls.id, idx + 1);
      const date = input.dateFor ? input.dateFor(p.cls, p.subject, idx) : input.startsOn;
      const teacher = teacherFor(p.cls.grade, p.subject);
      paperRows.push({
        id,
        schoolId,
        examId,
        classId: p.cls.id,
        subjectId: subjectId.get(p.subject)!,
        date: d(date),
        startTime: input.kind && input.kind !== "EXAM" ? "" : "09:00",
        endTime: input.kind && input.kind !== "EXAM" ? "" : max >= 75 ? "12:00" : "10:00",
        room: input.kind && input.kind !== "EXAM" ? "" : `Room ${p.cls.grade}${p.cls.section}`,
        maxMarks: max,
        passMarks: Math.round(max * 0.33),
        status: p.status,
        enteredById: p.status === "NOT_STARTED" ? null : teacher.id,
        submittedAt: ["SUBMITTED", "APPROVED", "RETURNED"].includes(p.status) ? d(input.endsOn) : null,
        reviewedById: ["APPROVED", "RETURNED"].includes(p.status) ? adminId : null,
        reviewedAt: ["APPROVED", "RETURNED"].includes(p.status) ? d(input.endsOn) : null,
        reviewNote: p.note ?? "",
      });
      if (p.status === "NOT_STARTED") continue;
      const roster = input.roster(p.cls);
      roster.forEach((s, i) => {
        if (p.partial && i >= Math.ceil(roster.length * 0.6)) return;
        const absent = rand() < 0.02;
        markRows.push({
          schoolId,
          paperId: id,
          studentId: s.id,
          marks: absent ? null : scoreFor(s, p.subject, max, input.difficulty ?? 0),
          attendance: absent ? "ABSENT" : "PRESENT",
        });
      });
    }
    await prisma.examPaper.createMany({ data: paperRows });
    await chunked(markRows, 1000, (part) => prisma.examMark.createMany({ data: part }));
    return { examId, papers: paperRows };
  };
  const currentRoster = (cls: Cls) => students.filter((s) => s.cls.id === cls.id);
  const allPapers = (list: Cls[], status: PaperPlan["status"] = "APPROVED") => list.flatMap((cls) => subjectsOf(cls.grade).map((subject) => ({ cls, subject, status })));
  const examDay = (start: string) => (_cls: Cls, _subject: string, idx: number) => {
    const base = d(start);
    let added = 0;
    const cur = new Date(base);
    while (added < idx) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      if (cur.getUTCDay() !== 0 && cur.getUTCDay() !== 6) added += 1;
    }
    return cur.toISOString().slice(0, 10);
  };

  // Last year: annual exam, approved and published.
  const prevRosterByClass = (cls: Cls) => prevStudents.filter((p) => p.cls.id === cls.id).map((p) => p.s);
  const prevAnnual = await createExam({
    name: "Annual Examination 2026",
    yearId: prevYear.id,
    termId: prevTerm.id,
    status: "PUBLISHED",
    startsOn: "2026-03-02",
    endsOn: "2026-03-12",
    weight: 100,
    maxMarks: (g) => (g <= 2 ? 50 : 100),
    papers: allPapers(prevClasses),
    roster: prevRosterByClass,
    dateFor: examDay("2026-03-02"),
    difficulty: 4,
  });

  // This year, Term 1.
  const mayTest = await createExam({
    name: "May Monthly Test",
    yearId: year.id,
    termId: term1.id,
    status: "COMPLETED",
    startsOn: "2026-05-18",
    endsOn: "2026-05-26",
    weight: 20,
    maxMarks: () => 25,
    papers: allPapers(classes),
    roster: currentRoster,
    dateFor: examDay("2026-05-18"),
  });
  const midTerm = await createExam({
    name: "Mid Term Examination",
    yearId: year.id,
    termId: term1.id,
    status: "PUBLISHED",
    startsOn: "2026-08-17",
    endsOn: "2026-08-27",
    weight: 60,
    maxMarks: (g) => (g <= 2 ? 50 : 100),
    papers: allPapers(classes),
    roster: currentRoster,
    dateFor: examDay("2026-08-17"),
    difficulty: 3,
  });
  // September test is mid-marking: shows every workflow state.
  const septPapers: PaperPlan[] = allPapers(classes).map((p, i) => {
    if (p.cls.grade <= 4) return { ...p, status: "APPROVED" as const };
    if (p.subject === "Computer" && p.cls.grade === 8) return { ...p, status: "NOT_STARTED" as const };
    if (p.subject === "Urdu" && p.cls.grade === 7) return { ...p, status: "RETURNED" as const, note: "Roll 4 and 9 look swapped — please recheck." };
    if (p.subject === "Science" && p.cls.grade >= 7) return { ...p, status: "DRAFT" as const, partial: true };
    if (p.subject === "English" || p.subject === "Mathematics") return { ...p, status: i % 3 === 0 ? ("APPROVED" as const) : ("SUBMITTED" as const) };
    return { ...p, status: "APPROVED" as const };
  });
  const septTest = await createExam({
    name: "September Monthly Test",
    yearId: year.id,
    termId: term1.id,
    status: "MARKING",
    startsOn: "2026-09-14",
    endsOn: "2026-09-22",
    weight: 20,
    maxMarks: () => 25,
    papers: septPapers,
    roster: currentRoster,
    dateFor: examDay("2026-09-14"),
  });

  // Assessments (Term 1) for the middle school.
  const middle = classes.filter((c) => c.grade >= 5);
  const assessments: { name: string; kind: "QUIZ" | "ASSIGNMENT" | "PRACTICAL" | "VIVA"; subject: string; date: string; max: number; grades?: number[]; status?: PaperPlan["status"]; partial?: boolean }[] = [
    { name: "Grammar quiz — tenses", kind: "QUIZ", subject: "English", date: "2026-05-06", max: 10 },
    { name: "Fractions quiz", kind: "QUIZ", subject: "Mathematics", date: "2026-05-13", max: 10 },
    { name: "Comprehension quiz", kind: "QUIZ", subject: "English", date: "2026-07-08", max: 10 },
    { name: "Algebra quiz", kind: "QUIZ", subject: "Mathematics", date: "2026-07-15", max: 15 },
    { name: "Plant cells worksheet", kind: "ASSIGNMENT", subject: "Science", date: "2026-06-10", max: 20 },
    { name: "Essay: My city", kind: "ASSIGNMENT", subject: "Urdu", date: "2026-06-17", max: 20 },
    { name: "Spreadsheet practical", kind: "PRACTICAL", subject: "Computer", date: "2026-07-22", max: 20, grades: [7, 8] },
    { name: "Recitation viva", kind: "VIVA", subject: "Islamiyat", date: "2026-07-29", max: 10, grades: [8] },
  ];
  for (const a of assessments) {
    for (const cls of middle.filter((c) => !a.grades || a.grades.includes(c.grade))) {
      const teacher = teacherFor(cls.grade, a.subject);
      await createExam({
        name: a.name,
        kind: a.kind,
        yearId: year.id,
        termId: term1.id,
        status: "COMPLETED",
        startsOn: a.date,
        endsOn: a.date,
        weight: 100,
        maxMarks: () => a.max,
        papers: [{ cls, subject: a.subject, status: "APPROVED" }],
        roster: currentRoster,
        createdById: teacher.email ? userIdByEmail.get(teacher.email) : undefined,
      });
    }
  }
  // Open work for the demo teacher logins.
  const farahId = userIdByEmail.get("teacher@greenfield.school");
  const bilalId = userIdByEmail.get("maths@greenfield.school");
  await createExam({ name: "Vocabulary quiz", kind: "QUIZ", yearId: year.id, termId: term1.id, status: "IN_PROGRESS", startsOn: "2026-09-24", endsOn: "2026-09-24", weight: 100, maxMarks: () => 10, papers: [{ cls: classByLabel(6, "A"), subject: "English", status: "DRAFT", partial: true }], roster: currentRoster, createdById: farahId });
  await createExam({ name: "Book report", kind: "ASSIGNMENT", yearId: year.id, termId: term1.id, status: "MARKING", startsOn: "2026-09-18", endsOn: "2026-09-18", weight: 100, maxMarks: () => 20, papers: [{ cls: classByLabel(5, "B"), subject: "English", status: "SUBMITTED" }], roster: currentRoster, createdById: farahId });
  await createExam({ name: "Geometry quiz", kind: "QUIZ", yearId: year.id, termId: term1.id, status: "IN_PROGRESS", startsOn: "2026-09-25", endsOn: "2026-09-25", weight: 100, maxMarks: () => 15, papers: [{ cls: classByLabel(5, "A"), subject: "Mathematics", status: "NOT_STARTED" }], roster: currentRoster, createdById: bilalId });

  // Term 2: upcoming exams with a date sheet.
  await createExam({
    name: "October Monthly Test",
    yearId: year.id,
    termId: term2.id,
    status: "SCHEDULED",
    startsOn: "2026-10-12",
    endsOn: "2026-10-20",
    weight: 20,
    maxMarks: () => 25,
    papers: allPapers(classes, "NOT_STARTED"),
    roster: currentRoster,
    dateFor: examDay("2026-10-12"),
  });
  await createExam({
    name: "Final Term Examination",
    yearId: year.id,
    termId: term2.id,
    status: "DRAFT",
    startsOn: "2027-03-01",
    endsOn: "2027-03-11",
    weight: 80,
    maxMarks: (g) => (g <= 2 ? 50 : 100),
    papers: allPapers(classes, "NOT_STARTED"),
    roster: currentRoster,
    dateFor: examDay("2027-03-01"),
  });

  // Results via the real results engine.
  const settings = new ExamSettingsService(prisma as unknown as PrismaService);
  const results = new ResultsService(prisma as unknown as PrismaService, settings);
  await results.computeExam(schoolId, prevAnnual.examId);
  await results.computeAnnual(schoolId, prevYear.id);
  await results.computeExam(schoolId, mayTest.examId);
  await results.computeExam(schoolId, midTerm.examId);
  await results.computeExam(schoolId, septTest.examId);
  await results.computeTerm(schoolId, term1.id);

  const remark = (pctScore: number) =>
    pctScore >= 85 ? "Outstanding work — keep it up." : pctScore >= 70 ? "Consistent effort and good understanding." : pctScore >= 55 ? "Satisfactory; more revision will help." : pctScore >= 40 ? "Needs regular practice at home." : "Needs close support — parent meeting advised.";
  for (const [scope, scopeKey] of [["EXAM", midTerm.examId], ["EXAM", prevAnnual.examId], ["ANNUAL", prevYear.id]] as const) {
    const rows = await prisma.studentResult.findMany({ where: { schoolId, scope, scopeKey }, select: { id: true, percentage: true } });
    await prisma.$transaction(
      rows.map((r) =>
        prisma.studentResult.update({
          where: { id: r.id },
          data: { teacherRemark: remark(r.percentage), principalRemark: r.percentage >= 85 ? "Well done." : "", publishedAt: d("2026-09-02") },
        }),
      ),
    );
  }
  await prisma.exam.updateMany({ where: { id: { in: [midTerm.examId, prevAnnual.examId] } }, data: { publishedAt: d("2026-09-02") } });

  // A pending correction from Farah on the mid term.
  const correctionPaper = midTerm.papers.find((p) => p.classId === classByLabel(6, "A").id && p.subjectId === subjectId.get("English"))!;
  const correctionStudent = currentRoster(classByLabel(6, "A"))[2];
  const existing = await prisma.examMark.findUnique({ where: { paperId_studentId: { paperId: correctionPaper.id!, studentId: correctionStudent.id } } });
  await prisma.markCorrection.create({
    data: {
      schoolId,
      paperId: correctionPaper.id!,
      studentId: correctionStudent.id,
      oldMarks: existing?.marks ?? null,
      newMarks: Math.min(100, (existing?.marks ?? 50) + 6),
      reason: "Totalling error — page 4 question 7 was not added.",
      requestedById: farahId!,
    },
  });

  // Notes, documents, audit, sequences ---------------------------------------------------------------------------
  const first = students[0];
  await prisma.communicationLog.createMany({
    data: [
      { schoolId, studentId: first.id, type: "NOTE", subject: "Settling in", body: `${first.first} has settled well into ${first.cls.name}.`, sentById: adminId, status: "logged" },
      { schoolId, studentId: first.id, type: "MEETING", subject: "Parent meeting", body: "Discussed mid term results and reading at home.", recipient: guardians[0]?.name ?? "", sentById: adminId, status: "logged" },
    ],
  });
  await prisma.schoolDocument.create({
    data: { schoolId, ownerType: "student", ownerId: first.id, kind: "birth_certificate", label: "Birth certificate", required: true, url: "https://example.com/docs/birth.pdf", uploadedBy: adminId },
  });
  await prisma.auditLog.create({ data: { schoolId, actorId: adminId, action: "seeded", entity: "school", entityId: schoolId, summary: "Demo workspace" } });
  const maxAdm = Math.max(...students.filter((s) => s.admissionNo.startsWith("ADM-2026")).map((s) => Number(s.admissionNo.slice(-4))), 0);
  await prisma.schoolSequence.createMany({
    data: [
      { schoolId, kind: "ADM", year: 2026, value: Math.max(maxAdm, admSeq) },
      { schoolId, kind: "APP", year: 2026, value: appSeq },
      { schoolId, kind: "INV", year: 2026, value: invSeq },
      { schoolId, kind: "PAY", year: 2026, value: paySeq },
      { schoolId, kind: "REC", year: 2026, value: paySeq },
      { schoolId, kind: "PSL", year: 2026, value: staff.length },
    ],
  });

  console.log(`  demo: ${students.length} students, ${staff.length} staff, ${classes.length} classes, ${lessons.length} lessons, ${invoices.length} invoices, ${attendance.length} attendance marks`);
}
