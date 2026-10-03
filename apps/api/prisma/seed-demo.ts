/**
 * Full demo workspace for the claimed school: classes, students & families, staff with contracts and
 * payroll, timetable, fee structures with six months of invoices and payments, attendance, admissions
 * pipeline, and a complete exam cycle (monthly tests, mid term, quizzes, marking workflow, results).
 */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, type QuestionPaperStatus, type QuestionType } from "@prisma/client";
import { DEFAULT_CATEGORIES, DEFAULT_GRADE_BANDS, SUBJECTS_BY_GRADE, SYSTEM_CATEGORIES, paperMarks } from "@wellrun/shared";
import { normalizeCnic, normalizePhone } from "../src/common/phone";
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

/** Parent portal demo login: sign in with this number (code 123456 when the API runs with PARENT_DEV_OTP=123456). */
export const DEMO_PARENT_PHONE = "03001234567";

const TUITION: Record<number, number> = { 1: 14500, 2: 14500, 3: 16000, 4: 16000, 5: 18500, 6: 18500, 7: 21000, 8: 21000 };

export async function seedDemoSchool(ctx: Ctx) {
  const { prisma, schoolId, adminId, campusId, passwordHash } = ctx;
  const today = d(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()));
  console.log("  demo: years, classes, subjects");

  // Years ---------------------------------------------------------------------------------
  const prevYear = await prisma.academicYear.create({ data: { schoolId, name: "2025-26", startsOn: d("2025-04-01"), endsOn: d("2026-03-31"), current: false, status: "CLOSED", closedAt: d("2026-04-01") } });
  const year = await prisma.academicYear.create({ data: { schoolId, name: "2026-27", startsOn: d("2026-04-01"), endsOn: d("2027-03-31"), current: true, status: "ACTIVE" } });

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
        const seedPhone = `03${pick(["00", "21", "33", "45"])}${pad(1000000 + ((guardians.length * 7919) % 9000000), 7)}`;
        guardians.push({
          id: guardianId,
          schoolId,
          name: father,
          // Distinct per family: phone and CNIC are unique within a school.
          phone: seedPhone,
          phoneNorm: normalizePhone(seedPhone)!,
          cnic: normalizeCnic(`42201${pad((guardians.length * 104729) % 99999999, 8)}`),
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
  // A known parent to sign in with: the guardian with the most children keeps an easy-to-remember number.
  const childCount = new Map<string, number>();
  for (const link of links) childCount.set(link.guardianId, (childCount.get(link.guardianId) ?? 0) + 1);
  const demoParent = guardians.reduce((best, g) => ((childCount.get(String(g.id)) ?? 0) > (childCount.get(String(best.id)) ?? 0) ? g : best), guardians[0]);
  demoParent.phone = DEMO_PARENT_PHONE;
  demoParent.phoneNorm = normalizePhone(DEMO_PARENT_PHONE)!;
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
  await prisma.attendanceSettings.create({
    data: { schoolId, workingWeekdays: [1, 2, 3, 4, 5], lowThresholdPct: 75, teacherEditDays: 1, lateCountsPresent: true, leaveCountsPresent: false },
  });
  const demoHolidays = [
    { name: "Independence Day", startsOn: d("2026-08-14"), endsOn: d("2026-08-14") },
    { name: "Iqbal Day", startsOn: d("2026-11-09"), endsOn: d("2026-11-09") },
    { name: "Winter break", startsOn: d("2026-12-22"), endsOn: d("2026-12-31") },
  ];
  await prisma.holiday.createMany({ data: demoHolidays.map((h) => ({ schoolId, ...h })) });
  const isHoliday = (day: Date) => demoHolidays.some((h) => day >= h.startsOn && day <= h.endsOn);
  const schoolDays: Date[] = [];
  for (let back = 0; schoolDays.length < 25 && back < 60; back += 1) {
    const day = new Date(today.getTime() - back * 86400000);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6 && day >= d("2026-08-10") && !isHoliday(day)) schoolDays.push(day);
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
      data: { schoolId, name: `${pick(FATHERS)} ${row.last}`, phone: `0300${pad(7700000 + index * 37, 7)}`, phoneNorm: normalizePhone(`0300${pad(7700000 + index * 37, 7)}`)!, cnic: normalizeCnic(`61101${pad(1234000 + index, 8)}`), relation: "Father" },
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


  // Syllabus / scheme of work ----------------------------------------------------------------------------------
  console.log("  demo: syllabus");
  type Bank = { unit: string; topics: string[] }[];
  const u = (unit: string, ...topics: string[]) => ({ unit, topics });
  const BANKS: Record<string, { all?: Bank; junior?: Bank; senior?: Bank }> = {
    English: {
      junior: [
        u("Phonics & reading", "Letter sounds & blends", "Sight words", "Reading short passages", "Rhyming words"),
        u("Nouns & pronouns", "Common and proper nouns", "Singular and plural", "Pronouns", "Articles a / an / the"),
        u("Verbs & tenses", "Action words", "Present tense", "Past tense", "Future tense"),
        u("Adjectives & adverbs", "Describing words", "Comparison", "Adverbs of manner", "Opposites & synonyms"),
        u("Writing", "Sentence building", "Paragraph writing", "Picture composition", "Letter writing"),
        u("Poetry & stories", "Poem recitation", "Story elements", "Moral stories", "Revision"),
      ],
      senior: [
        u("Reading comprehension", "Skimming & scanning", "Inference questions", "Vocabulary in context", "Summarising"),
        u("Grammar: parts of speech", "Nouns & pronouns", "Verbs & modals", "Adjectives & adverbs", "Prepositions & conjunctions"),
        u("Tenses & voice", "Simple & continuous tenses", "Perfect tenses", "Active and passive voice", "Direct and indirect speech"),
        u("Composition", "Paragraph writing", "Essay writing", "Story writing", "Dialogue writing"),
        u("Letters & applications", "Formal letters", "Informal letters", "Applications", "Notices & emails"),
        u("Literature", "Poetry appreciation", "Short story analysis", "Drama excerpt", "Revision & past papers"),
      ],
    },
    Mathematics: {
      junior: [
        u("Numbers to 1000", "Place value", "Comparing & ordering", "Rounding", "Roman numerals"),
        u("Addition & subtraction", "Adding with carrying", "Subtracting with borrowing", "Word problems", "Mental maths"),
        u("Multiplication & division", "Times tables", "Multiplying by 2-digit numbers", "Division facts", "Word problems"),
        u("Fractions", "Parts of a whole", "Equivalent fractions", "Adding like fractions", "Comparing fractions"),
        u("Measurement", "Length & weight", "Time & calendar", "Money", "Perimeter"),
        u("Shapes & data", "2D and 3D shapes", "Symmetry", "Pictographs", "Bar graphs"),
      ],
      senior: [
        u("Whole numbers & factors", "HCF & LCM", "Divisibility rules", "Prime factorisation", "Squares & roots"),
        u("Fractions & decimals", "Operations on fractions", "Decimals", "Fractions to decimals", "Word problems"),
        u("Ratio & percentage", "Ratio and proportion", "Percentages", "Profit & loss", "Simple interest"),
        u("Algebra basics", "Variables & expressions", "Simplifying", "Solving linear equations", "Word problems"),
        u("Geometry", "Angles", "Triangles", "Circles", "Area & perimeter"),
        u("Data handling", "Mean, median, mode", "Bar & line graphs", "Pie charts", "Probability basics"),
      ],
    },
    Science: {
      junior: [
        u("Living things", "Living and non-living", "Needs of living things", "Life cycles", "Habitats"),
        u("Plants", "Parts of a plant", "How plants make food", "Seeds & germination", "Uses of plants"),
        u("Animals", "Animal groups", "Food chains", "Adaptation", "Pets & farm animals"),
        u("Matter", "Solids, liquids, gases", "Changing state", "Materials & their uses", "Mixtures"),
        u("Forces & energy", "Push and pull", "Light & shadows", "Sound", "Sources of energy"),
        u("Earth & space", "Weather", "Water cycle", "Sun, moon, stars", "Our environment"),
      ],
      senior: [
        u("Cells & life processes", "Cell structure", "Tissues & organs", "Nutrition", "Respiration"),
        u("Plants & photosynthesis", "Photosynthesis", "Transpiration", "Reproduction in plants", "Plant adaptations"),
        u("Matter & mixtures", "States of matter", "Elements & compounds", "Separation techniques", "Acids & bases"),
        u("Forces & motion", "Speed & velocity", "Friction", "Gravity", "Simple machines"),
        u("Energy & electricity", "Forms of energy", "Electric circuits", "Conductors & insulators", "Magnetism"),
        u("Earth & environment", "Rocks & soil", "Atmosphere", "Pollution", "Conservation"),
      ],
    },
    Urdu: {
      all: [
        u("Hamd, Naat aur nazmain", "Hamd", "Naat", "Qaumi nazm", "Nazm ka mafhoom"),
        u("Nasr: kahaniyan", "Sabaq-amoz kahani", "Mutalia aur sawalat", "Mushkil alfaz", "Khulasa"),
        u("Qawaid: ism aur fail", "Ism ki aqsam", "Fail ki aqsam", "Sifat", "Zameer"),
        u("Qawaid: jumla sazi", "Mukammal jumla", "Wahid jama", "Mutzad alfaz", "Muhavare"),
        u("Tehreer", "Mazmoon nigari", "Khat nawisi", "Darkhwast", "Kahani likhna"),
        u("Imla aur khushkhati", "Imla", "Khushkhati", "Alfaz ki durusti", "Mushq"),
      ],
    },
    Islamiyat: {
      all: [
        u("Iman and beliefs", "Tawhid", "Risalat", "Akhirah", "Angels and books"),
        u("Pillars of Islam", "Salah", "Zakat", "Sawm", "Hajj"),
        u("Seerah", "Life in Makkah", "Hijrah", "Life in Madinah", "Character of the Prophet (PBUH)"),
        u("Quran", "Surah recitation", "Memorisation", "Translation", "Lessons from the Quran"),
        u("Akhlaq", "Honesty", "Respect for parents", "Kindness to neighbours", "Cleanliness"),
        u("Duas & manners", "Daily duas", "Etiquette of eating", "Etiquette of greeting", "Revision"),
      ],
    },
    "Social Studies": {
      all: [
        u("Our family & community", "Family", "Neighbourhood", "Community helpers", "Rules & rights"),
        u("Our country", "Pakistan's provinces", "Capital cities", "National symbols", "Quaid-e-Azam"),
        u("Maps & directions", "Cardinal directions", "Reading a map", "Landforms", "Rivers & mountains"),
        u("People & occupations", "Farming", "Industry", "Trade", "Transport"),
        u("Culture & festivals", "Eid", "Independence Day", "Regional cultures", "Traditions"),
        u("Our environment", "Natural resources", "Pollution", "Recycling", "Revision"),
      ],
    },
    "Pakistan Studies": {
      all: [
        u("Geography of Pakistan", "Location & borders", "Mountains & plateaus", "Rivers & plains", "Climate"),
        u("Pakistan Movement", "Two-Nation Theory", "Sir Syed Ahmad Khan", "Allama Iqbal", "Lahore Resolution"),
        u("Quaid-e-Azam", "Early life", "Political struggle", "Creation of Pakistan", "Principles & legacy"),
        u("Government & constitution", "Constitution of Pakistan", "Parliament", "Provincial governments", "Citizens' rights"),
        u("Economy & resources", "Agriculture", "Industries", "Minerals & energy", "Trade"),
        u("Culture & heritage", "Languages", "Heritage sites", "Festivals", "Revision"),
      ],
    },
    Computer: {
      all: [
        u("Introduction to computers", "Parts of a computer", "Input & output devices", "Hardware & software", "Safe use"),
        u("Operating system", "Desktop & icons", "Files & folders", "Paint basics", "Keyboard skills"),
        u("Word processing", "Typing & formatting", "Inserting pictures", "Tables", "Printing"),
        u("Presentations", "Creating slides", "Design & animation", "Presenting", "Project"),
        u("Internet & safety", "Browsing", "Email basics", "Online safety", "Digital citizenship"),
        u("Programming basics", "Algorithms", "Scratch blocks", "Loops", "Mini project"),
      ],
    },
  };
  const bankFor = (subject: string, grade: number): Bank => BANKS[subject].all ?? (grade <= 4 ? BANKS[subject].junior! : BANKS[subject].senior!);
  const TEXTBOOKS: Record<string, string> = {
    English: "Oxford Progressive English; graded readers",
    Urdu: "Sindh/Punjab Textbook Board Urdu; Urdu qaida",
    Mathematics: "Oxford New Syllabus Mathematics; worksheets",
    Science: "Science Around Us; lab kits",
    Islamiyat: "Islamiyat textbook; Noorani Qaida",
    "Social Studies": "Social Studies textbook; atlas",
    "Pakistan Studies": "Pakistan Studies textbook; atlas",
    Computer: "Computer Studies textbook; lab sessions",
  };
  type SylUnit = { id: string; topicIds: string[] };
  const syllabusTree = new Map<string, SylUnit[]>();
  const sylRows: Prisma.SyllabusCreateManyInput[] = [];
  const unitRows: Prisma.SyllabusUnitCreateManyInput[] = [];
  const topicRows: Prisma.SyllabusTopicCreateManyInput[] = [];
  const slice = (from: Date, to: Date, n: number, i: number) => ({
    from: new Date(from.getTime() + ((to.getTime() - from.getTime()) * i) / n),
    to: new Date(from.getTime() + ((to.getTime() - from.getTime()) * (i + 1)) / n - 86400000),
  });
  const behindSyllabi = new Set(["Grade 7|Science", "Grade 6|Mathematics"]);
  const buildSyllabi = (list: Cls[], yearRow: { id: string; name: string }, plan: (unitIndex: number, units: number) => { termId: string; from: Date; to: Date }, archived: boolean) => {
    const grades = new Map<string, number>();
    list.forEach((c) => grades.set(c.name, c.grade));
    for (const [gradeName, grade] of grades) {
      for (const subject of subjectsOf(grade)) {
        const bank = bankFor(subject, grade);
        const syllabusId = randomUUID();
        sylRows.push({
          id: syllabusId,
          schoolId,
          yearId: yearRow.id,
          gradeName,
          subjectId: subjectId.get(subject)!,
          overview: `Scheme of work for ${gradeName} ${subject}, ${yearRow.name}: ${bank.length} units covering ${bank.reduce((n, b) => n + b.topics.length, 0)} topics across the year.`,
          assessmentNotes: "Monthly tests (25 marks), mid term and final term exams. Quizzes and assignments count towards the term result.",
          resources: TEXTBOOKS[subject] ?? "",
          updatedById: adminId,
        });
        const units: SylUnit[] = [];
        bank.forEach((b, unitIndex) => {
          const unitId = randomUUID();
          const { termId, from, to } = plan(unitIndex, bank.length);
          unitRows.push({ id: unitId, syllabusId, title: `Unit ${unitIndex + 1}: ${b.unit}`, termId, plannedFrom: from, plannedTo: to, sortOrder: unitIndex });
          const topicIds: string[] = [];
          b.topics.forEach((title, topicIndex) => {
            const id = randomUUID();
            topicIds.push(id);
            let progress: "PLANNED" | "IN_PROGRESS" | "COMPLETED" = "PLANNED";
            let completedOn: Date | null = null;
            if (archived || to < today) {
              progress = "COMPLETED";
              completedOn = new Date(to.getTime() - 2 * 86400000);
            } else if (from <= today) {
              progress = topicIndex < b.topics.length / 2 ? "COMPLETED" : topicIndex === Math.floor(b.topics.length / 2) ? "IN_PROGRESS" : "PLANNED";
              completedOn = progress === "COMPLETED" ? new Date(Math.min(today.getTime(), from.getTime() + (topicIndex + 1) * 5 * 86400000)) : null;
            }
            // A couple of syllabi are visibly behind: the last topic of the most recent finished unit was never taught.
            if (!archived && behindSyllabi.has(`${gradeName}|${subject}`) && to < today && unitIndex === 2 && topicIndex === b.topics.length - 1) {
              progress = "PLANNED";
              completedOn = null;
            }
            topicRows.push({ id, syllabusId, unitId, title, objectives: `Students can explain and apply: ${title.toLowerCase()}.`, plannedPeriods: 2 + (topicIndex % 3), sortOrder: topicIndex, progress, completedOn });
          });
          units.push({ id: unitId, topicIds });
        });
        syllabusTree.set(`${yearRow.id}|${gradeName}|${subject}`, units);
      }
    }
  };
  buildSyllabi(
    classes,
    year,
    (i, n) => {
      const first = i < Math.ceil(n / 2);
      const idx = first ? i : i - Math.ceil(n / 2);
      const count = first ? Math.ceil(n / 2) : n - Math.ceil(n / 2);
      const range = slice(first ? d("2026-04-01") : d("2026-10-01"), first ? d("2026-09-30") : d("2027-03-31"), count, idx);
      return { termId: first ? term1.id : term2.id, ...range };
    },
    false,
  );
  buildSyllabi(prevClasses, prevYear, (i, n) => ({ termId: prevTerm.id, ...slice(d("2025-04-01"), d("2026-03-31"), n, i) }), true);
  await prisma.syllabus.createMany({ data: sylRows });
  await prisma.syllabusUnit.createMany({ data: unitRows });
  await chunked(topicRows, 1000, (part) => prisma.syllabusTopic.createMany({ data: part }));

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
  const octTest = await createExam({
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
  const finalTerm = await createExam({
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

  // Which syllabus topics each exam covers. Covered topics are locked in the syllabus; the Final Term is left open.
  const gradeOfClass = new Map([...classes, ...prevClasses].map((c) => [c.id, c.name]));
  const subjectNameById = new Map<string, string>([...subjectId].map(([name, id]) => [id, name]));
  const cover = async (papers: Prisma.ExamPaperCreateManyInput[], yearId: string, pick: (units: SylUnit[]) => string[]) => {
    const rows = papers.flatMap((p) => {
      const units = syllabusTree.get(`${yearId}|${gradeOfClass.get(p.classId)}|${subjectNameById.get(p.subjectId)}`);
      return units ? pick(units).map((topicId) => ({ paperId: p.id as string, topicId })) : [];
    });
    await chunked(rows, 1000, (part) => prisma.examPaperTopic.createMany({ data: part }));
  };
  await cover(prevAnnual.papers, prevYear.id, (units) => units.flatMap((x) => x.topicIds));
  await cover(mayTest.papers, year.id, (units) => units[0].topicIds.slice(0, 2));
  await cover(midTerm.papers, year.id, (units) => [...units[0].topicIds, ...units[1].topicIds]);
  await cover(septTest.papers, year.id, (units) => units[2].topicIds.slice(0, 3));
  await cover(octTest.papers, year.id, (units) => units[3].topicIds.slice(0, 2));

  // Question papers ---------------------------------------------------------------------------------------------
  console.log("  demo: question papers");
  type Q = { text: string; marks: number; options?: unknown; answer?: string; answerLines?: number };
  type Sec = { title: string; type: QuestionType; instructions?: string; passage?: string; rtl?: boolean; attempt?: number; questions: Q[] };
  const mc = (text: string, options: string[], correct: number, marks = 1): Q => ({ text, marks, options, answer: String(correct) });
  const tf = (text: string, truth: boolean): Q => ({ text, marks: 1, answer: truth ? "TRUE" : "FALSE" });
  const fb = (text: string, answer: string): Q => ({ text, marks: 1, answer });
  const sq = (text: string, marks: number, lines: number, answer = ""): Q => ({ text, marks, answerLines: lines, answer });
  const makePaper = async (input: {
    examId: string;
    gradeName: string;
    subject: string;
    status: QuestionPaperStatus;
    durationMinutes: number;
    instructions?: string;
    createdById: string;
    reviewNote?: string;
    sections: Sec[];
    prints?: { classId: string; classLabel: string; copies: number; answerKey?: boolean }[];
  }) => {
    const sections = input.sections.map((sec) => ({ attemptCount: sec.attempt ?? null, questions: sec.questions }));
    const reviewed = input.status === "APPROVED" || input.status === "RETURNED";
    await prisma.questionPaper.create({
      data: {
        schoolId,
        examId: input.examId,
        gradeName: input.gradeName,
        subjectId: subjectId.get(input.subject)!,
        title: `${input.gradeName} ${input.subject}`,
        instructions: input.instructions ?? "",
        durationMinutes: input.durationMinutes,
        status: input.status,
        totalMarks: paperMarks(sections),
        createdById: input.createdById,
        updatedById: input.createdById,
        submittedAt: input.status === "DRAFT" ? null : new Date(),
        reviewedById: reviewed ? adminId : null,
        reviewedAt: reviewed ? new Date() : null,
        reviewNote: input.reviewNote ?? "",
        sections: {
          create: input.sections.map((sec, i) => ({
            title: sec.title,
            type: sec.type,
            instructions: sec.instructions ?? "",
            passage: sec.passage ?? "",
            rtl: sec.rtl ?? false,
            attemptCount: sec.attempt ?? null,
            sortOrder: i,
            questions: { create: sec.questions.map((q, qi) => ({ text: q.text, marks: q.marks, options: (q.options ?? []) as Prisma.InputJsonValue, answer: q.answer ?? "", answerLines: q.answerLines ?? 0, sortOrder: qi })) },
          })),
        },
        prints: { create: (input.prints ?? []).map((p) => ({ schoolId, classId: p.classId, classLabel: p.classLabel, copies: p.copies, answerKey: p.answerKey ?? false, printedById: adminId })) },
      },
    });
  };

  const g5a = classByLabel(5, "A");
  const g5b = classByLabel(5, "B");
  const g7a = classByLabel(7, "A");
  const g7b = classByLabel(7, "B");

  // Grade 5 English: complete, approved and printed — one of every kind of question (100 marks).
  await makePaper({
    examId: finalTerm.examId,
    gradeName: "Grade 5",
    subject: "English",
    status: "APPROVED",
    durationMinutes: 180,
    instructions: "Attempt all sections. Write neatly. Use a blue or black pen only.",
    createdById: farahId!,
    prints: [
      { classId: g5a.id, classLabel: "Grade 5 A", copies: 13 },
      { classId: g5b.id, classLabel: "Grade 5 B", copies: 13 },
      { classId: g5a.id, classLabel: "Grade 5 A", copies: 3 },
    ],
    sections: [
      {
        title: "Section A: Multiple choice questions",
        type: "MCQ",
        instructions: "Choose the correct answer. Each question carries 1 mark.",
        questions: [
          mc("She ____ to school every day.", ["go", "goes", "going", "gone"], 1),
          mc("Choose the plural of 'child'.", ["childs", "childes", "children", "childrens"], 2),
          mc("Which word is a noun?", ["quickly", "happy", "table", "run"], 2),
          mc("The opposite of 'brave' is:", ["strong", "coward", "kind", "clever"], 1),
          mc("'They ____ playing in the garden.' Fill in the correct word.", ["is", "am", "are", "be"], 2),
          mc("Which is a proper noun?", ["city", "Lahore", "river", "boy"], 1),
          mc("The past tense of 'write' is:", ["writed", "wrote", "written", "writing"], 1),
          mc("Which article goes before 'apple'?", ["a", "an", "the", "no article"], 1),
          mc("Choose the adjective: 'The tall boy ran fast.'", ["boy", "ran", "tall", "fast"], 2),
          mc("A word with the same meaning as 'big' is:", ["small", "huge", "thin", "short"], 1),
        ],
      },
      {
        title: "Section B: True or false",
        type: "TRUE_FALSE",
        instructions: "Write True or False against each statement.",
        questions: [
          tf("A sentence always begins with a capital letter.", true),
          tf("'Quickly' is an adjective.", false),
          tf("A full stop comes at the end of a question.", false),
          tf("'Books' is a plural noun.", true),
          tf("'I am' can be shortened to 'I'm'.", true),
        ],
      },
      {
        title: "Section C: Fill in the blanks",
        type: "FILL_BLANK",
        instructions: "Fill in the blanks with suitable words.",
        questions: [
          fb("The sun ____ in the east.", "rises"),
          fb("We drink ____ when we are thirsty.", "water"),
          fb("Ali ____ his homework yesterday. (do)", "did"),
          fb("There are seven ____ in a week.", "days"),
          fb("She is ____ than her sister. (tall)", "taller"),
        ],
      },
      {
        title: "Section D: Short questions",
        type: "SHORT",
        instructions: "Attempt any SIX questions. Each question carries 3 marks.",
        attempt: 6,
        questions: [
          sq("What is a noun? Give two examples.", 3, 3, "A naming word, e.g. boy, Karachi."),
          sq("Write the plural of: mouse, leaf, box.", 3, 2, "mice, leaves, boxes"),
          sq("Make a sentence using the word 'because'.", 3, 2),
          sq("What is the difference between 'a' and 'an'?", 3, 3),
          sq("Write three opposites: hot, early, empty.", 3, 2, "cold, late, full"),
          sq("Rewrite in the past tense: 'He plays cricket.'", 3, 2, "He played cricket."),
          sq("Why do we use capital letters?", 3, 3),
          sq("Write two sentences about your school.", 3, 3),
        ],
      },
      {
        title: "Section E: Comprehension",
        type: "COMPREHENSION",
        instructions: "Read the passage carefully and answer the questions.",
        passage:
          "Hamza lives in a small village near Multan. Every morning he wakes up early and helps his father feed the cows. After breakfast he walks two kilometres to school with his friends. On the way they pass green fields of wheat and a shady mango orchard. Hamza likes science best, and he dreams of becoming a doctor so that he can serve the people of his village.",
        questions: [
          sq("Where does Hamza live?", 3, 2, "In a small village near Multan."),
          sq("What does Hamza do before breakfast?", 3, 2, "He helps his father feed the cows."),
          sq("What can Hamza see on the way to school?", 3, 3),
          sq("What does Hamza want to become and why?", 3, 3),
        ],
      },
      {
        title: "Section F: Translation",
        type: "TRANSLATION",
        instructions: "Translate the following sentences into Urdu.",
        questions: [
          sq("Honesty is the best policy.", 4, 3),
          sq("We should respect our teachers and elders.", 4, 3),
          sq("Pakistan is our beloved homeland.", 4, 3),
        ],
      },
      {
        title: "Section G: Long questions",
        type: "LONG",
        instructions: "Attempt any TWO questions. Each question carries 7 marks.",
        attempt: 2,
        questions: [
          sq("Write a paragraph of about 80 words on 'My Best Friend'.", 7, 10),
          sq("Describe your daily routine in 8–10 sentences.", 7, 10),
          sq("Write a paragraph on 'The Importance of Trees'.", 7, 10),
        ],
      },
      {
        title: "Section H: Story writing",
        type: "WRITING",
        instructions: "Write a story of about 120 words on the given outline.",
        questions: [sq("A woodcutter loses his axe in the river → a fairy appears with a golden axe → he refuses it and tells the truth → the fairy rewards his honesty. (Title: The Honest Woodcutter)", 14, 18)],
      },
      {
        title: "Section I: Letter writing",
        type: "WRITING",
        instructions: "Write a letter on the given topic.",
        questions: [sq("Write a letter to your friend inviting him to your birthday party.", 10, 14)],
      },
    ],
  });

  // Grade 5 Mathematics: finished by the teacher, waiting for the admin to approve.
  await makePaper({
    examId: finalTerm.examId,
    gradeName: "Grade 5",
    subject: "Mathematics",
    status: "SUBMITTED",
    durationMinutes: 180,
    instructions: "Show all working. Calculators are not allowed.",
    createdById: bilalId!,
    sections: [
      {
        title: "Section A: Multiple choice questions",
        type: "MCQ",
        instructions: "Choose the correct answer.",
        questions: [
          mc("What is 7 × 8?", ["54", "56", "58", "64"], 1),
          mc("The place value of 5 in 4,582 is:", ["5", "50", "500", "5000"], 2),
          mc("Which fraction is equal to 1/2?", ["2/3", "3/6", "2/5", "4/9"], 1),
          mc("The perimeter of a square with side 6 cm is:", ["12 cm", "24 cm", "36 cm", "18 cm"], 1),
          mc("What is 1000 − 375?", ["625", "635", "725", "575"], 0),
          mc("How many minutes are in 2 hours?", ["100", "120", "180", "90"], 1),
          mc("Round 463 to the nearest ten.", ["460", "470", "500", "400"], 0),
          mc("Which number is a multiple of 9?", ["28", "45", "52", "64"], 1),
          mc("0.5 is the same as:", ["1/5", "1/2", "5/100", "5/1"], 1),
          mc("The LCM of 4 and 6 is:", ["10", "12", "24", "2"], 1),
        ],
      },
      {
        title: "Section B: True or false",
        type: "TRUE_FALSE",
        questions: [tf("An angle of 90° is called a right angle.", true), tf("12 is a prime number.", false), tf("All squares are rectangles.", true), tf("3/4 is greater than 7/8.", false), tf("1 kilometre equals 100 metres.", false)],
      },
      {
        title: "Section C: Fill in the blanks",
        type: "FILL_BLANK",
        questions: [fb("The sum of angles in a triangle is ____ degrees.", "180"), fb("25% of 80 is ____.", "20"), fb("9 × ____ = 72", "8"), fb("The next number in 5, 10, 15, ____ is 20.", "20"), fb("A polygon with 6 sides is called a ____.", "hexagon")],
      },
      {
        title: "Section D: Short questions",
        type: "SHORT",
        instructions: "Attempt all questions. Each carries 3 marks.",
        questions: Array.from({ length: 10 }, (_, i) => sq(`Solve: ${120 + i * 17} ÷ ${i + 2}. Write the quotient and remainder.`, 3, 2)),
      },
      {
        title: "Section E: Long questions",
        type: "LONG",
        instructions: "Show all steps. Each question carries 6 marks.",
        questions: [
          sq("Find the HCF and LCM of 24 and 36.", 6, 8),
          sq("Add: 3/4 + 5/8 + 1/2. Write the answer in simplest form.", 6, 8),
          sq("Draw a rectangle of length 8 cm and width 5 cm. Find its area and perimeter.", 6, 8),
          sq("A shopkeeper buys 12 pens at Rs. 35 each and sells them at Rs. 42 each. Find his total profit.", 6, 8),
          sq("Convert 3.5 kg into grams and 2 hours 15 minutes into minutes.", 6, 6),
        ],
      },
      {
        title: "Section F: Word problems",
        type: "CUSTOM",
        instructions: "Solve the following word problems. Each carries 5 marks.",
        questions: [
          sq("A train covers 240 km in 4 hours. What is its speed per hour?", 5, 6),
          sq("Sara has Rs. 500. She buys 3 notebooks at Rs. 85 each. How much money is left?", 5, 6),
          sq("A tank holds 600 litres. If 3/5 of it is filled, how many litres are in the tank?", 5, 6),
          sq("The ages of 4 friends are 10, 12, 11 and 11. Find their average age.", 5, 6),
        ],
      },
    ],
  });

  // Grade 6 English: still being written.
  await makePaper({
    examId: finalTerm.examId,
    gradeName: "Grade 6",
    subject: "English",
    status: "DRAFT",
    durationMinutes: 180,
    createdById: farahId!,
    sections: [
      {
        title: "Section A: Multiple choice questions",
        type: "MCQ",
        instructions: "Choose the correct answer.",
        questions: [mc("Which sentence is in the passive voice?", ["Ali ate the apple.", "The apple was eaten by Ali.", "Ali is eating.", "Ali will eat."], 1), mc("A synonym of 'rapid' is:", ["slow", "quick", "weak", "late"], 1), mc("Choose the correct spelling.", ["recieve", "receive", "receeve", "receve"], 1)],
      },
      { title: "Section B: Short questions", type: "SHORT", instructions: "Attempt any FIVE questions.", attempt: 5, questions: [sq("Define a simile and give an example.", 3, 3), sq("What is the difference between 'their' and 'there'?", 3, 3)] },
    ],
  });

  // Grade 6 Science: returned by the admin with a note.
  await makePaper({
    examId: finalTerm.examId,
    gradeName: "Grade 6",
    subject: "Science",
    status: "RETURNED",
    durationMinutes: 180,
    createdById: adminId,
    reviewNote: "Section C should say 'attempt any 8', and MCQ 4 has two correct options. Please fix and resubmit.",
    sections: [
      {
        title: "Section A: Multiple choice questions",
        type: "MCQ",
        questions: Array.from({ length: 10 }, (_, i) => mc(`Science MCQ ${i + 1}: which statement is correct?`, ["Option one", "Option two", "Option three", "Option four"], i % 4)),
      },
      { title: "Section B: True or false", type: "TRUE_FALSE", questions: Array.from({ length: 10 }, (_, i) => tf(`Statement ${i + 1} about plants and animals.`, i % 2 === 0)) },
      { title: "Section C: Short questions", type: "SHORT", instructions: "Attempt any SEVEN questions.", attempt: 7, questions: Array.from({ length: 10 }, (_, i) => sq(`Short question ${i + 1}: explain briefly.`, 3, 3)) },
      { title: "Section D: Long questions", type: "LONG", instructions: "Attempt any THREE questions.", attempt: 3, questions: Array.from({ length: 4 }, (_, i) => sq(`Long question ${i + 1}: describe in detail with a labelled diagram.`, 8, 12)) },
      { title: "Section E: Diagrams and practical", type: "CUSTOM", instructions: "Draw and label neatly.", questions: Array.from({ length: 4 }, (_, i) => sq(`Draw a neat labelled diagram of item ${i + 1}.`, 8, 10)) },
    ],
  });

  // Grade 7 Urdu monthly test: right-to-left, approved and printed for both sections (25 marks).
  await makePaper({
    examId: octTest.examId,
    gradeName: "Grade 7",
    subject: "Urdu",
    status: "APPROVED",
    durationMinutes: 60,
    instructions: "تمام سوالات حل کیجیے۔ صاف اور خوش خط لکھیے۔",
    createdById: adminId,
    prints: [
      { classId: g7a.id, classLabel: "Grade 7 A", copies: 13 },
      { classId: g7b.id, classLabel: "Grade 7 B", copies: 13 },
    ],
    sections: [
      {
        title: "سوال نمبر 1: درست جواب کا انتخاب کیجیے",
        type: "MCQ",
        rtl: true,
        instructions: "ہر سوال کا ایک نمبر ہے۔",
        questions: [
          mc("علامہ اقبال کا تعلق کس شہر سے تھا؟", ["لاہور", "سیالکوٹ", "کراچی", "ملتان"], 1),
          mc("پاکستان کا قومی پھول کون سا ہے؟", ["گلاب", "چنبیلی", "سورج مکھی", "گیندا"], 1),
          mc("'صبح' کا متضاد لفظ ہے:", ["رات", "شام", "دوپہر", "سویرا"], 1),
          mc("'کتاب' کی جمع ہے:", ["کتابیں", "کتابے", "کتابان", "کتابات"], 0),
          mc("اردو کا رسم الخط کون سا ہے؟", ["دیوناگری", "نستعلیق", "رومن", "گرمکھی"], 1),
        ],
      },
      {
        title: "سوال نمبر 2: مختصر جوابات لکھیے",
        type: "SHORT",
        rtl: true,
        instructions: "کوئی سے چار سوالات حل کیجیے۔ ہر سوال کے دو نمبر ہیں۔",
        attempt: 4,
        questions: [
          sq("اپنے وطن پاکستان کے بارے میں دو جملے لکھیے۔", 2, 3),
          sq("'محنت' کا مطلب لکھیے۔", 2, 2),
          sq("واحد لکھیے: کتابیں، بچے", 2, 2),
          sq("اپنے پسندیدہ کھیل کا نام اور ایک وجہ لکھیے۔", 2, 3),
          sq("اس جملے میں فعل پہچانیے: 'بچے باغ میں کھیل رہے ہیں۔'", 2, 2),
        ],
      },
      {
        title: "سوال نمبر 3: انگریزی جملوں کا اردو ترجمہ کیجیے",
        type: "TRANSLATION",
        instructions: "ہر سوال کے تین نمبر ہیں۔",
        questions: [sq("Honesty is the best policy.", 3, 3), sq("We should respect our teachers.", 3, 3)],
      },
      {
        title: "سوال نمبر 4: خط لکھیے",
        type: "WRITING",
        rtl: true,
        questions: [sq("اپنے دوست کو سالگرہ کی دعوت کا خط لکھیے۔", 6, 12)],
      },
    ],
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

  // Diary and notices ---------------------------------------------------------------------------------------
  console.log("  demo: diary, notices");
  const diaryDays: Date[] = [];
  for (let back = 0; diaryDays.length < 4 && back < 10; back += 1) {
    const day = new Date(today.getTime() - back * 86_400_000);
    if (day.getUTCDay() !== 0) diaryDays.push(day);
  }
  const HOMEWORK: Record<string, string[]> = {
    English: ["Read the story on page 24 and answer questions 1 to 4 in your notebook.", "Write five sentences using the new words from this week's spelling list."],
    Urdu: ["سبق نمبر 5 کے سوالات کے جواب کاپی میں لکھیں۔", "صفحہ 18 کی خوشخطی کریں۔"],
    Mathematics: ["Exercise 6.2, questions 1 to 10. Show your working.", "Learn the 7 and 8 times tables for a quick test tomorrow."],
    Science: ["Draw and label the parts of a plant. Colour neatly.", "Read chapter 4 and write three things you learned."],
    Islamiyat: ["Revise Surah Al-Ikhlas and the meaning of the first two ayat.", "Learn the dua before eating."],
    "Social Studies": ["Make a simple map of your neighbourhood showing school and home."],
    "Pakistan Studies": ["Write a short paragraph on Allama Iqbal."],
    Computer: ["Practice typing your name and your school's name five times."],
  };
  const diary: Prisma.DiaryEntryCreateManyInput[] = [];
  for (const [dayIndex, day] of diaryDays.entries()) {
    for (const c of classes) {
      const names = subjectsOf(c.grade).filter((name) => HOMEWORK[name]);
      // Rotate so each day covers two or three different subjects per class.
      const picked = [0, 1, 2].map((n) => names[(dayIndex * 2 + n + c.grade) % names.length]).filter((name, i, all) => all.indexOf(name) === i);
      for (const [n, name] of picked.entries()) {
        const lines = HOMEWORK[name];
        diary.push({
          schoolId,
          campusId,
          yearId: year.id,
          classId: c.id,
          subjectId: subjectId.get(name)!,
          date: day,
          kind: n === 2 && dayIndex === 0 ? "CLASSWORK" : "HOMEWORK",
          title: "",
          body: lines[(dayIndex + n) % lines.length],
          dueOn: n === 2 && dayIndex === 0 ? null : new Date(day.getTime() + 2 * 86_400_000),
          authorStaffId: teacherFor(c.grade, name).id,
        });
      }
    }
  }
  const classTeacherNote = (c: Cls) => byName.get(primaryTeacher[c.grade]!);
  for (const c of classes.filter((x) => x.grade <= 4)) {
    diary.push({
      schoolId,
      campusId,
      yearId: year.id,
      classId: c.id,
      subjectId: null,
      date: diaryDays[0],
      kind: "NOTE",
      title: "Tomorrow",
      body: "Please send a water bottle and check that your child's school bag is packed.",
      authorStaffId: classTeacherNote(c)?.id,
    });
  }
  await chunked(diary, 500, (part) => prisma.diaryEntry.createMany({ data: part }));
  await prisma.notice.createMany({
    data: [
      { schoolId, title: "Parent-teacher meeting", body: "A parent-teacher meeting will be held on the first Saturday of next month from 9:00 am to 12:00 pm. Please bring your child's diary.", pinned: true, createdById: adminId, publishedAt: new Date(today.getTime() - 86_400_000 + 9 * 3_600_000) },
      { schoolId, title: "Fee due date reminder", body: "Monthly fees are due by the 10th. Please keep the fee slip and the receipt for your records.", createdById: adminId, publishedAt: new Date(today.getTime() - 3 * 86_400_000 + 9 * 3_600_000) },
      { schoolId, title: "اسکول کا یومِ کھیل", body: "اگلے ماہ اسکول کا سالانہ یومِ کھیل منایا جائے گا۔ بچوں کو کھیل کا لباس پہنا کر بھیجیں۔", createdById: adminId, publishedAt: new Date(today.getTime() - 5 * 86_400_000 + 9 * 3_600_000) },
      { schoolId, title: "Grade 5 science trip", body: "Grade 5 will visit the science museum next Thursday. Permission slips must be returned by Tuesday.", audience: "CLASSES", classIds: classes.filter((x) => x.grade === 5).map((x) => x.id), createdById: adminId, publishedAt: new Date(today.getTime() - 2 * 86_400_000 + 9 * 3_600_000) },
    ],
  });

  // Staff attendance and leave ------------------------------------------------------------------------------
  console.log("  demo: staff attendance, leave");
  const dayBefore = (n: number) => new Date(today.getTime() - n * 86_400_000);
  const staffDays: Date[] = [];
  for (let back = 1; staffDays.length < 12 && back < 30; back += 1) if (dayBefore(back).getUTCDay() !== 0) staffDays.push(dayBefore(back));
  const person = (name: string) => byName.get(name)!.id;
  const leaveRows: Prisma.StaffLeaveCreateManyInput[] = [
    { schoolId, staffId: person("Hina Tariq"), type: "SICK", fromOn: staffDays[3], toOn: staffDays[2], workingDays: 2, reason: "Fever and a doctor's rest.", status: "APPROVED", decidedById: adminId, decidedAt: new Date(staffDays[4].getTime() + 12 * 3_600_000), decisionNote: "Get well soon." },
    { schoolId, staffId: person("Nadia Perveen"), type: "CASUAL", fromOn: staffDays[7], toOn: staffDays[7], workingDays: 1, reason: "Family function.", status: "APPROVED", decidedById: adminId, decidedAt: new Date(staffDays[8].getTime() + 12 * 3_600_000) },
    { schoolId, staffId: person("Kamran Ashraf"), type: "ANNUAL", fromOn: new Date(today.getTime() + 6 * 86_400_000), toOn: new Date(today.getTime() + 8 * 86_400_000), workingDays: 3, reason: "Travelling for a family wedding.", status: "APPROVED", decidedById: adminId, decidedAt: new Date(today.getTime() - 3_600_000) },
    { schoolId, staffId: person("Waqar Ahmed"), type: "CASUAL", fromOn: new Date(today.getTime() + 2 * 86_400_000), toOn: new Date(today.getTime() + 2 * 86_400_000), workingDays: 1, reason: "Need to renew my passport.", status: "PENDING" },
    { schoolId, staffId: person("Rubina Akhtar"), type: "SICK", fromOn: new Date(today.getTime() + 1 * 86_400_000), toOn: new Date(today.getTime() + 3 * 86_400_000), workingDays: 3, reason: "Dental surgery and recovery.", status: "PENDING" },
    { schoolId, staffId: person("Usman Ghani"), type: "CASUAL", fromOn: staffDays[5], toOn: staffDays[5], workingDays: 1, reason: "Personal work.", status: "REJECTED", decidedById: adminId, decidedAt: new Date(staffDays[6].getTime() + 12 * 3_600_000), decisionNote: "Exams that day. Please pick another date." },
  ];
  await prisma.staffLeave.createMany({ data: leaveRows });
  const away = leaveRows.filter((l) => l.status === "APPROVED");
  const onLeave = (staffId: string, day: Date) => away.some((l) => l.staffId === staffId && (l.fromOn as Date) <= day && day <= (l.toOn as Date));
  const staffAttendance: Prisma.StaffAttendanceCreateManyInput[] = [];
  for (const day of staffDays) {
    for (const s of staff) {
      if (onLeave(s.id, day)) {
        staffAttendance.push({ schoolId, staffId: s.id, date: day, status: "ON_LEAVE", source: "LEAVE" });
        continue;
      }
      const roll = rand();
      if (roll < 0.05) {
        staffAttendance.push({ schoolId, staffId: s.id, date: day, status: "ABSENT", source: "AUTO_ABSENT" });
        continue;
      }
      const late = roll > 0.92;
      // Pakistan time is UTC+5: the instant is midnight UTC plus the local minutes minus five hours.
      const minutes = late ? 8 * 60 + 20 + Math.floor(rand() * 35) : 7 * 60 + 35 + Math.floor(rand() * 40);
      staffAttendance.push({
        schoolId,
        staffId: s.id,
        date: day,
        checkInAt: new Date(day.getTime() + minutes * 60_000 - 5 * 3_600_000),
        status: minutes > 8 * 60 + 15 ? "LATE" : "PRESENT",
        source: "LOGIN",
        lateMinutes: minutes > 8 * 60 + 15 ? minutes - 8 * 60 : 0,
      });
    }
  }
  await chunked(staffAttendance, 500, (part) => prisma.staffAttendance.createMany({ data: part }));

  // Accounts, vouchers and inventory --------------------------------------------------------------------------
  console.log("  demo: accounts, vouchers, inventory");
  const openingDay = d("2026-04-01");
  const accountRows = [
    { id: randomUUID(), name: "Cash in hand", kind: "CASH" as const, openingBalancePkr: 150_000, sortOrder: 0 },
    { id: randomUUID(), name: "Bank account", kind: "BANK" as const, openingBalancePkr: 2_500_000, sortOrder: 1 },
    { id: randomUUID(), name: "Meezan savings", kind: "BANK" as const, openingBalancePkr: 500_000, sortOrder: 2 },
  ];
  await prisma.financeAccount.createMany({ data: accountRows.map((a) => ({ ...a, schoolId, openingOn: openingDay })) });
  const [cashAcc, bankAcc, savingsAcc] = accountRows;
  const categoryRows = [
    ...Object.values(SYSTEM_CATEGORIES).map((c) => ({ id: randomUUID(), name: c.name, kind: c.kind, systemKey: c.key as string | null })),
    ...DEFAULT_CATEGORIES.map((c) => ({ id: randomUUID(), name: c.name, kind: c.kind, systemKey: null as string | null })),
  ];
  await prisma.financeCategory.createMany({ data: categoryRows.map((c) => ({ ...c, schoolId })) });
  const cat = (prefix: string) => categoryRows.find((c) => c.name.startsWith(prefix))!.id;

  let vchSeq = 0;
  const vouchers: Prisma.VoucherCreateManyInput[] = [];
  const voucher = (day: Date, v: { type: "PAYMENT" | "RECEIPT" | "TRANSFER"; amountPkr: number; accountId: string; toAccountId?: string; categoryId?: string; party?: string; note?: string; method?: string; reference?: string; source?: "INVENTORY"; sourceId?: string; id?: string }) => {
    vchSeq += 1;
    const id = v.id ?? randomUUID();
    vouchers.push({
      id,
      schoolId,
      number: `VCH-${day.getUTCFullYear()}-${pad(vchSeq, 4)}`,
      type: v.type,
      date: day,
      amountPkr: v.amountPkr,
      accountId: v.accountId,
      toAccountId: v.toAccountId ?? null,
      categoryId: v.categoryId ?? null,
      party: v.party ?? "",
      method: v.method ?? "",
      reference: v.reference ?? "",
      note: v.note ?? "",
      source: v.source ?? "MANUAL",
      sourceId: v.sourceId ?? null,
      createdById: adminId,
      createdAt: new Date(day.getTime() + 9 * 3_600_000),
    });
    return id;
  };
  const bookMonths: string[] = [];
  for (let m = "2026-04"; m <= today.toISOString().slice(0, 7); m = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 1)).toISOString().slice(0, 7)) bookMonths.push(m);
  const onOrBefore = (m: string, dd: number) => {
    const day = d(`${m}-${pad(dd, 2)}`);
    return day <= today ? day : null;
  };
  for (const [i, m] of bookMonths.entries()) {
    const at = (dd: number, make: (day: Date) => void) => {
      const day = onOrBefore(m, dd);
      if (day) make(day);
    };
    at(3, (day) => voucher(day, { type: "PAYMENT", amountPkr: 180_000, accountId: bankAcc.id, categoryId: cat("Rent"), party: "Greenfield Properties", method: "bank", reference: `Cheque ${4100 + i}`, note: "Monthly building rent" }));
    at(8, (day) => voucher(day, { type: "TRANSFER", amountPkr: 250_000, accountId: bankAcc.id, toAccountId: cashAcc.id, note: "Cash withdrawn for small expenses" }));
    at(12, (day) => voucher(day, { type: "PAYMENT", amountPkr: 62_000 + Math.floor(rand() * 34_000), accountId: bankAcc.id, categoryId: cat("Utilities"), party: pick(["K-Electric", "SSGC", "PTCL"]), method: "online", note: "Utility bills" }));
    at(15, (day) => voucher(day, { type: "RECEIPT", amountPkr: 20_000 + Math.floor(rand() * 16_000), accountId: cashAcc.id, categoryId: cat("Uniform"), party: "Uniform shop counter", method: "cash", note: "Uniforms and books sold" }));
    if (i % 2 === 0) at(18, (day) => voucher(day, { type: "PAYMENT", amountPkr: 14_000 + Math.floor(rand() * 26_000), accountId: cashAcc.id, categoryId: cat("Repairs"), party: pick(["Ali Electric Works", "City Plumbers", "Raza Carpenters"]), method: "cash", note: pick(["Fan and wiring repairs", "Washroom plumbing", "Broken desks mended"]) }));
    if (i % 3 === 1) at(22, (day) => voucher(day, { type: "PAYMENT", amountPkr: 9_000 + Math.floor(rand() * 12_000), accountId: cashAcc.id, categoryId: cat("Transport"), party: "Generator fuel", method: "cash", note: "Diesel for the generator" }));
    if (i === 3) at(14, (day) => voucher(day, { type: "PAYMENT", amountPkr: 45_000, accountId: cashAcc.id, categoryId: cat("Events"), party: "Sports day", method: "cash", note: "Medals, refreshments and ground set-up" }));
    if (i === 2) at(10, (day) => voucher(day, { type: "RECEIPT", amountPkr: 100_000, accountId: bankAcc.id, categoryId: cat("Donations"), party: "Mr. Hashmi", method: "bank", note: "Donation for the library" }));
    if (i === 5) at(9, (day) => voucher(day, { type: "RECEIPT", amountPkr: 50_000, accountId: cashAcc.id, categoryId: cat("Donations"), party: "Parents' association", method: "cash", note: "Annual contribution" }));
    if (i === 4) at(25, (day) => voucher(day, { type: "TRANSFER", amountPkr: 300_000, accountId: bankAcc.id, toAccountId: savingsAcc.id, note: "Moved to savings" }));
  }

  // Stock: opening counts, then purchases that each write their own voucher, then things given out.
  type Mv = Prisma.InventoryMovementCreateManyInput;
  const movements: Mv[] = [];
  const stockItems = [
    { name: "A4 paper (ream)", kind: "CONSUMABLE" as const, category: "Stationery", unit: "ream", location: "Store room", reorderLevel: 20, unitCostPkr: 1_450, open: 60 },
    { name: "Whiteboard markers", kind: "CONSUMABLE" as const, category: "Stationery", unit: "box", location: "Store room", reorderLevel: 10, unitCostPkr: 1_800, open: 14 },
    { name: "Chalk", kind: "CONSUMABLE" as const, category: "Stationery", unit: "box", location: "Store room", reorderLevel: 8, unitCostPkr: 350, open: 24 },
    { name: "Cleaning supplies", kind: "CONSUMABLE" as const, category: "Housekeeping", unit: "set", location: "Janitor room", reorderLevel: 6, unitCostPkr: 2_600, open: 10 },
    { name: "Printer ink cartridge", kind: "CONSUMABLE" as const, category: "Office", unit: "pcs", location: "Office", reorderLevel: 3, unitCostPkr: 9_500, open: 5 },
    { name: "Student desk and chair", kind: "ASSET" as const, category: "Furniture", unit: "pcs", location: "Classrooms", reorderLevel: null, unitCostPkr: 6_500, open: 360 },
    { name: "Whiteboard", kind: "ASSET" as const, category: "Furniture", unit: "pcs", location: "Classrooms", reorderLevel: null, unitCostPkr: 12_000, open: 24 },
    { name: "Projector", kind: "ASSET" as const, category: "Electronics", unit: "pcs", location: "Classrooms", reorderLevel: null, unitCostPkr: 85_000, open: 6 },
    { name: "Lab computer", kind: "ASSET" as const, category: "Electronics", unit: "pcs", location: "Computer lab", reorderLevel: null, unitCostPkr: 95_000, open: 20 },
    { name: "Ceiling fan", kind: "ASSET" as const, category: "Electronics", unit: "pcs", location: "Classrooms", reorderLevel: null, unitCostPkr: 8_500, open: 48 },
    { name: "Water cooler", kind: "ASSET" as const, category: "Electronics", unit: "pcs", location: "Corridors", reorderLevel: null, unitCostPkr: 65_000, open: 4 },
  ].map((it) => ({ ...it, id: randomUUID(), onHand: 0 }));
  const at = (back: number) => new Date(today.getTime() - back * 86_400_000);
  for (const it of stockItems) {
    movements.push({ id: randomUUID(), schoolId, itemId: it.id, type: "ADJUST", quantity: it.open, date: d("2026-04-02"), note: "Opening stock count", createdById: adminId });
    it.onHand += it.open;
  }
  const buy = (name: string, back: number, quantity: number, supplier: string, price?: number) => {
    const it = stockItems.find((x) => x.name === name)!;
    const unit = price ?? it.unitCostPkr;
    const day = at(back);
    const movementId = randomUUID();
    const voucherId = voucher(day, { type: "PAYMENT", amountPkr: quantity * unit, accountId: cashAcc.id, categoryId: cat(it.kind === "ASSET" ? "Furniture" : "Supplies"), party: supplier, method: "cash", note: `Bought ${quantity} ${it.unit} of ${it.name}`, source: "INVENTORY", sourceId: movementId });
    movements.push({ id: movementId, schoolId, itemId: it.id, type: "PURCHASE", quantity, unitCostPkr: unit, totalCostPkr: quantity * unit, date: day, supplier, voucherId, createdById: adminId });
    it.onHand += quantity;
    it.unitCostPkr = unit;
  };
  const give = (name: string, back: number, quantity: number, to: string, type: "ISSUE" | "DAMAGE" = "ISSUE") => {
    const it = stockItems.find((x) => x.name === name)!;
    movements.push({ id: randomUUID(), schoolId, itemId: it.id, type, quantity: -quantity, date: at(back), issuedTo: to, note: type === "DAMAGE" ? "Broken beyond repair" : "", createdById: adminId });
    it.onHand -= quantity;
  };
  buy("A4 paper (ream)", 60, 40, "Hamid Stationers", 1_480);
  buy("Whiteboard markers", 45, 10, "Hamid Stationers");
  buy("Printer ink cartridge", 30, 4, "Techno Mart", 9_800);
  buy("Cleaning supplies", 21, 6, "Clean & Co");
  buy("Ceiling fan", 50, 6, "Al-Noor Electric", 8_900);
  buy("Student desk and chair", 90, 40, "Raza Carpenters", 6_800);
  give("A4 paper (ream)", 40, 25, "Examination office");
  give("A4 paper (ream)", 18, 30, "Office and photocopying");
  give("A4 paper (ream)", 6, 22, "Examination office");
  give("Whiteboard markers", 35, 9, "Teachers' staff room");
  give("Whiteboard markers", 12, 6, "Teachers' staff room");
  give("Chalk", 28, 10, "Primary block");
  give("Cleaning supplies", 14, 12, "Janitor room");
  give("Printer ink cartridge", 20, 5, "Office");
  give("Student desk and chair", 70, 6, "Classrooms", "DAMAGE");
  give("Ceiling fan", 40, 2, "Classrooms", "DAMAGE");
  await prisma.voucher.createMany({ data: vouchers });
  await prisma.inventoryItem.createMany({ data: stockItems.map((it) => ({ id: it.id, schoolId, name: it.name, kind: it.kind, category: it.category, unit: it.unit, location: it.location, reorderLevel: it.reorderLevel, onHand: it.onHand, unitCostPkr: it.unitCostPkr, status: "IN_USE" as const })) });
  await prisma.inventoryMovement.createMany({ data: movements });

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
      { schoolId, kind: "VCH", year: 2026, value: vchSeq },
    ],
  });

  console.log(`  demo: parent portal login ${DEMO_PARENT_PHONE} (${childCount.get(String(demoParent.id)) ?? 1} children)`);
  console.log(`  demo: ${students.length} students, ${staff.length} staff, ${classes.length} classes, ${lessons.length} lessons, ${invoices.length} invoices, ${attendance.length} attendance marks`);
}
