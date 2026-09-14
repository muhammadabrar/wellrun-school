import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const photos = {
  greenfieldCover:
    "https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1600&q=80",
  greenfieldLogo:
    "https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=240&q=80",
  crescentCover:
    "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=80",
  crescentLogo:
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=240&q=80",
  northernCover:
    "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1600&q=80",
  northernLogo:
    "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=240&q=80",
  classroom:
    "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80",
  sports:
    "https://images.unsplash.com/photo-1461896836934-ffe607ba6851?auto=format&fit=crop&w=1200&q=80",
  lab: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80",
};

type SchoolSeed = {
  slug: string;
  name: string;
  city: string;
  area: string;
  type: string;
  feeBand: string;
  whatsapp: string;
  claimed: boolean;
  adminEmail?: string;
  adminName?: string;
  profile: {
    about: string;
    location: string;
    principal: string;
    establishedYear: number;
    studentCount: number;
    teacherCount: number;
    facilities: string[];
    labs: string[];
    sports: string[];
    activities: string[];
    programs: string[];
    feeMinPkr: number;
    feeMaxPkr: number;
    feeNotes: string;
    latitude: number;
    longitude: number;
  };
  cover: string;
  logo: string;
};

const schools: SchoolSeed[] = [
  {
    slug: "greenfield-grammar",
    name: "Greenfield Grammar School",
    city: "Karachi",
    area: "DHA",
    type: "private",
    feeBand: "20k_40k",
    whatsapp: "03001234567",
    claimed: true,
    adminEmail: "admin@greenfield.school",
    adminName: "Ayesha Rahman",
    profile: {
      about:
        "A Cambridge-pathway school in DHA Phase 6. Parents come for steady academics, a working science lab, and a principal who still knows students by name.",
      location: "Plot 14, Street 7, DHA Phase 6, Karachi",
      principal: "Ayesha Rahman",
      establishedYear: 1998,
      studentCount: 820,
      teacherCount: 64,
      facilities: ["Library", "Transport", "Computer lab", "Prayer room", "Sports ground"],
      labs: ["Physics", "Chemistry", "Computer"],
      sports: ["Cricket", "Football", "Swimming"],
      activities: ["Debate", "Qirat", "Robotics"],
      programs: ["Matric", "Cambridge O Levels", "A Levels"],
      feeMinPkr: 18500,
      feeMaxPkr: 32000,
      feeNotes: "Monthly tuition. Admission and annual charges billed separately.",
      latitude: 24.814,
      longitude: 67.064,
    },
    cover: photos.greenfieldCover,
    logo: photos.greenfieldLogo,
  },
  {
    slug: "crescent-valley",
    name: "Crescent Valley Academy",
    city: "Lahore",
    area: "Gulberg",
    type: "private",
    feeBand: "10k_20k",
    whatsapp: "03007654321",
    claimed: false,
    profile: {
      about:
        "A neighbourhood academy in Gulberg that grew from one campus to three. Strong in Urdu literature and girls’ sports, with transparent monthly fee bands.",
      location: "12-C Gulberg III, Lahore",
      principal: "Imran Malik",
      establishedYear: 2006,
      studentCount: 540,
      teacherCount: 41,
      facilities: ["Library", "Transport", "Art room"],
      labs: ["Biology", "Computer"],
      sports: ["Hockey", "Badminton", "Athletics"],
      activities: ["Drama", "Naat", "Community service"],
      programs: ["Matric", "ICS", "Pre-medical"],
      feeMinPkr: 12000,
      feeMaxPkr: 21000,
      feeNotes: "Sibling discount of 15% on the second child.",
      latitude: 31.52,
      longitude: 74.351,
    },
    cover: photos.crescentCover,
    logo: photos.crescentLogo,
  },
  {
    slug: "northern-lights",
    name: "Northern Lights School",
    city: "Islamabad",
    area: "F-7",
    type: "private",
    feeBand: "20k_40k",
    whatsapp: "03001112233",
    claimed: false,
    profile: {
      about:
        "A compact F-7 school built around small classes and outdoor time. Families compare it with larger chains for calmer days and clearer communication.",
      location: "House 8, Street 22, F-7/2, Islamabad",
      principal: "Sana Qureshi",
      establishedYear: 2014,
      studentCount: 310,
      teacherCount: 28,
      facilities: ["Library", "Playground", "Science lab"],
      labs: ["Science", "Computer"],
      sports: ["Football", "Table tennis"],
      activities: ["Hiking club", "Coding club"],
      programs: ["Primary", "Middle", "Matric"],
      feeMinPkr: 22000,
      feeMaxPkr: 28000,
      feeNotes: "Includes activity period. Transport billed by route.",
      latitude: 33.721,
      longitude: 73.057,
    },
    cover: photos.northernCover,
    logo: photos.northernLogo,
  },
];

const firstNames = ["Ahmed", "Fatima", "Hassan", "Zainab", "Ali", "Maryam", "Usman", "Hira"];
const lastNames = ["Khan", "Siddiqui", "Butt", "Sheikh", "Raza", "Iqbal"];

function karachiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function seedSchool(school: SchoolSeed, passwordHash: string) {
  const created = await prisma.school.create({
    data: {
      slug: school.slug,
      name: school.name,
      city: school.city,
      area: school.area,
      type: school.type,
      feeBand: school.feeBand,
      whatsapp: school.whatsapp,
      address: school.profile.location,
      published: true,
      claimStatus: school.claimed ? "APPROVED" : "UNCLAIMED",
      l2Active: school.claimed,
      setupCompleted: school.claimed,
      setupStep: school.claimed ? 9 : 1,
      profile: { create: school.profile },
      media: {
        create: [
          { kind: "COVER", url: school.cover, caption: "Campus", sortOrder: 0 },
          { kind: "LOGO", url: school.logo, caption: school.name, sortOrder: 1 },
          { kind: "PHOTO", url: photos.classroom, caption: "Classrooms", sortOrder: 2 },
          { kind: "PHOTO", url: photos.lab, caption: "Science lab", sortOrder: 3 },
          { kind: "PHOTO", url: photos.sports, caption: "Sports day", sortOrder: 4 },
        ],
      },
      posts: {
        create: [
          {
            title: "Admissions open for 2026",
            body: "Campus tours every Saturday. Bring the last report card and a parent CNIC copy.",
          },
          {
            title: "Fee reminder window",
            body: "September tuition is due by the 10th. Receipts are issued the same day in the office.",
          },
        ],
      },
      reviews: {
        create: [
          {
            author: "Nadia Farooq",
            roleLabel: "Parent",
            rating: 5,
            body: "Teachers reply the same day. That alone is why we stayed.",
          },
          {
            author: "Omar Javed",
            roleLabel: "Alumni",
            rating: 4,
            body: "Labs were used, not locked. I still remember the chemistry practicals.",
          },
        ],
      },
    },
  });

  if (!school.claimed || !school.adminEmail || !school.adminName) return;

  const admin = await prisma.user.create({
    data: {
      email: school.adminEmail,
      password: passwordHash,
      name: school.adminName,
      role: "SCHOOL_ADMIN",
      schoolId: created.id,
    },
  });

  const campus = await prisma.campus.create({
    data: {
      schoolId: created.id,
      name: "Main campus",
      address: school.profile.location,
      phone: school.whatsapp,
      principal: school.adminName,
      code: "MAIN",
      isMain: true,
    },
  });

  await prisma.campusMembership.create({
    data: { schoolId: created.id, campusId: campus.id, userId: admin.id, role: "SUPER_ADMIN" },
  });

  const year = await prisma.academicYear.create({
    data: {
      schoolId: created.id,
      name: "2026-27",
      startsOn: new Date("2026-04-01"),
      endsOn: new Date("2027-03-31"),
      current: true,
    },
  });

  const grade5 = await prisma.class.create({
    data: { schoolId: created.id, yearId: year.id, campusId: campus.id, name: "Grade 5", section: "A" },
  });
  const grade6 = await prisma.class.create({
    data: { schoolId: created.id, yearId: year.id, campusId: campus.id, name: "Grade 6", section: "A" },
  });

  const feePlan = await prisma.feePlan.create({
    data: {
      schoolId: created.id,
      yearId: year.id,
      name: "September tuition",
      amountPkr: school.profile.feeMinPkr,
    },
  });

  const today = new Date(`${karachiToday()}T00:00:00.000Z`);
  const seededStudents: { id: string; score: number }[] = [];

  for (let i = 0; i < 8; i += 1) {
    const admissionNo = String(10230 + i);
    const student = await prisma.student.create({
      data: {
        schoolId: created.id,
        admissionNo,
        rollNo: String(i + 1),
        firstName: firstNames[i],
        lastName: lastNames[i % lastNames.length],
        gender: i % 2 === 0 ? "male" : "female",
        dateOfBirth: new Date(2014, i % 12, 4 + i),
        campusId: campus.id,
        admissionDate: new Date("2026-04-08"),
        firstAdmissionDate: new Date("2024-04-08"),
      },
    });

    const guardian = await prisma.guardian.create({
      data: {
        schoolId: created.id,
        name: `Parent of ${firstNames[i]}`,
        phone: `0300${String(1000000 + i).slice(0, 7)}`,
        cnic: `42101${String(10000000 + i).slice(0, 8)}`,
        email: `parent.${admissionNo}@example.com`,
        relation: "Mother",
      },
    });

    await prisma.studentGuardian.create({
      data: { studentId: student.id, guardianId: guardian.id },
    });

    await prisma.enrollment.create({
      data: {
        schoolId: created.id,
        studentId: student.id,
        classId: i < 6 ? grade5.id : grade6.id,
        active: true,
      },
    });

    await prisma.attendanceRecord.create({
      data: {
        schoolId: created.id,
        studentId: student.id,
        classId: i < 6 ? grade5.id : grade6.id,
        date: today,
        status: i === 1 || i === 5 ? "ABSENT" : "PRESENT",
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        schoolId: created.id,
        studentId: student.id,
        feePlanId: feePlan.id,
        amountPkr: school.profile.feeMinPkr,
        status: i < 3 ? "PAID" : "ISSUED",
        dueOn: new Date("2026-09-10"),
      },
    });

    if (i < 3) {
      await prisma.payment.create({
        data: {
          schoolId: created.id,
          invoiceId: invoice.id,
          amountPkr: school.profile.feeMinPkr,
          method: "cash",
          receiptNo: `WR-2026-${school.slug.slice(0, 3).toUpperCase()}${String(i + 1).padStart(3, "0")}`,
        },
      });
    }
    seededStudents.push({ id: student.id, score: i % 3 === 0 ? 92 : 68 });
  }

  const midterm = await prisma.exam.create({
    data: {
      schoolId: created.id,
      yearId: year.id,
      name: "Midterm 2026",
      heldOn: new Date("2026-08-20"),
    },
  });
  await prisma.examResult.createMany({
    data: seededStudents.map((row) => ({
      examId: midterm.id,
      studentId: row.id,
      totalMarks: 100,
      obtainedMarks: row.score,
    })),
  });

  await prisma.staff.create({
    data: { schoolId: created.id, name: school.adminName, title: "Principal", email: school.adminEmail },
  });

  const teacher = await prisma.staff.create({
    data: {
      schoolId: created.id,
      name: "Farah Noor",
      title: "Grade 5 teacher",
      email: "teacher@greenfield.school",
      subjects: ["English"],
    },
  });

  await prisma.user.create({
    data: {
      email: "teacher@greenfield.school",
      password: passwordHash,
      name: "Farah Noor",
      role: "TEACHER",
      schoolId: created.id,
    },
  });

  await prisma.teacherAssignment.create({
    data: { schoolId: created.id, staffId: teacher.id, classId: grade5.id, subject: "English" },
  });

  const periods = await Promise.all(
    [
      { label: "Period 1", startTime: "08:00", endTime: "08:45", sortOrder: 1 },
      { label: "Period 2", startTime: "08:45", endTime: "09:30", sortOrder: 2 },
      { label: "Break", startTime: "09:30", endTime: "09:50", sortOrder: 3, isBreak: true },
      { label: "Period 3", startTime: "09:50", endTime: "10:35", sortOrder: 4 },
    ].map((period) => prisma.timetablePeriod.create({ data: { schoolId: created.id, ...period } })),
  );

  await prisma.timetableLesson.create({
    data: {
      schoolId: created.id,
      classId: grade5.id,
      periodId: periods[0].id,
      staffId: teacher.id,
      weekday: 1,
      subject: "English",
    },
  });

  await prisma.auditLog.create({
    data: {
      schoolId: created.id,
      actorId: admin.id,
      action: "seeded",
      entity: "school",
      entityId: created.id,
      summary: "Demo workspace",
    },
  });
}

async function main() {
  await prisma.classSubject.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.admissionForm.deleteMany();
  await prisma.feeItem.deleteMany();
  await prisma.campusMembership.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.timetableLesson.deleteMany();
  await prisma.timetablePeriod.deleteMany();
  await prisma.teacherAssignment.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.schoolClaim.deleteMany();
  await prisma.campus.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.studentGuardian.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.student.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.class.deleteMany();
  await prisma.feePlan.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.schoolPost.deleteMany();
  await prisma.schoolReview.deleteMany();
  await prisma.schoolMedia.deleteMany();
  await prisma.schoolProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();

  const passwordHash = await bcrypt.hash("school123", 10);
  for (const school of schools) {
    await seedSchool(school, passwordHash);
  }

  await prisma.user.create({
    data: {
      email: "ops@wellrun.school",
      password: passwordHash,
      name: "Wellrun Ops",
      role: "PLATFORM_ADMIN",
    },
  });

  await prisma.user.create({
    data: {
      email: "parent@wellrun.school",
      password: passwordHash,
      name: "Nadia Farooq",
      role: "PARENT",
    },
  });

  console.log("Seeded 3 schools + users.");
  console.log("  School admin  admin@greenfield.school / school123");
  console.log("  Teacher       teacher@greenfield.school / school123");
  console.log("  Platform      ops@wellrun.school / school123");
  console.log("  Parent        parent@wellrun.school / school123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
