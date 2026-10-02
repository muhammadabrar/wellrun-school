import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { seedDemoSchool } from "./seed-demo";

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

  await seedDemoSchool({ prisma, schoolId: created.id, adminId: admin.id, campusId: campus.id, passwordHash, address: school.profile.location });
}

async function main() {
  console.log("Seeding: clearing tables");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "ParentDevice",
      "ParentUser",
      "OtpChallenge",
      "DiaryEntry",
      "Notice",
      "AdmissionTestScore",
      "SchoolDocument",
      "CommunicationLog",
      "AdmissionApplication",
      "SchoolSequence",
      "QuestionPaperPrint",
      "Question",
      "QuestionSection",
      "QuestionPaper",
      "ExamPaperTopic",
      "SyllabusTopic",
      "SyllabusUnit",
      "Syllabus",
      "StudentResult",
      "MarkCorrection",
      "ExamMark",
      "ExamPaper",
      "Exam",
      "Term",
      "GradingScale",
      "ExamSettings",
      "ReportCardTemplate",
      "ClassSubject",
      "Subject",
      "AdmissionForm",
      "FbrInvoice",
      "Receipt",
      "PaymentAllocation",
      "StudentCredit",
      "InvoiceItem",
      "StudentFeeOverride",
      "StudentFeeAssignment",
      "StudentDiscount",
      "Discount",
      "FeeStructureItem",
      "FeeStructure",
      "FeeHead",
      "SchoolFeeSettings",
      "FeeItem",
      "CampusMembership",
      "AuditLog",
      "TimetableLesson",
      "TimetablePeriod",
      "TeacherAssignment",
      "Invite",
      "PasswordReset",
      "SchoolClaim",
      "Payment",
      "Invoice",
      "AttendanceRecord",
      "Enrollment",
      "StudentGuardian",
      "Guardian",
      "Student",
      "Payslip",
      "StaffStatusChange",
      "StaffContract",
      "Staff",
      "Class",
      "FeePlan",
      "AcademicYear",
      "Campus",
      "SchoolPost",
      "SchoolReview",
      "SchoolMedia",
      "SchoolProfile",
      "User",
      "School"
    CASCADE
  `);
  console.log("Seeding: tables truncated");

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
  console.log("  Teachers      teacher@greenfield.school (English), maths@greenfield.school, primary@greenfield.school / school123");
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
