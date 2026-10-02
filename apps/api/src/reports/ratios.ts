import {
  RATIO_DEFS,
  formatRatio,
  ratioStatus,
  roundTo,
  safeDivide,
  type AttendanceCounts,
  type AttendanceSettingsInput,
  type RatioKey,
  type RatioView,
} from "@wellrun/shared";

export type RatioInputs = {
  students: number;
  boys: number;
  girls: number;
  classes: number;
  teachers: number;
  staff: number;
  billedPkr: number;
  collectedPkr: number;
  grossBilledPkr: number;
  discountPkr: number;
  overdueStudents: number;
  attendedDays: number;
  countedDays: number;
  staffAttendedDays: number;
  staffCountedDays: number;
  passed: number;
  resulted: number;
  collectionTrend: { label: string; billedPkr: number; collectedPkr: number }[];
  attendanceTrend: { label: string; attendedDays: number; countedDays: number }[];
};

/** Attended and counted days using the school's own rules for late and leave, the same ones attendancePct uses. */
export function attendanceTally(counts: AttendanceCounts, settings: Pick<AttendanceSettingsInput, "lateCountsPresent" | "leaveCountsPresent">) {
  const leave = counts.LEAVE + counts.EXCUSED;
  return {
    attended: counts.PRESENT + (settings.lateCountsPresent ? counts.LATE : 0) + (settings.leaveCountsPresent ? leave : 0),
    counted: counts.PRESENT + counts.ABSENT + counts.LATE + (settings.leaveCountsPresent ? leave : 0),
  };
}

const pct = (a: number, b: number) => {
  const v = safeDivide(a, b);
  return v == null ? null : roundTo(v * 100, 1);
};

const per = (a: number, b: number) => {
  const v = safeDivide(a, b);
  return v == null ? null : roundTo(v, 1);
};

export function buildRatios(input: RatioInputs): RatioView[] {
  const values: Record<RatioKey, { value: number | null; numerator: number | null; denominator: number | null; trend: RatioView["trend"]; note: string }> = {
    studentTeacher: {
      value: per(input.students, input.teachers),
      numerator: input.students,
      denominator: input.teachers,
      trend: [],
      note: "Teachers are active staff who have a class or a timetable lesson this year.",
    },
    studentStaff: { value: per(input.students, input.staff), numerator: input.students, denominator: input.staff, trend: [], note: "All active staff, teaching and non-teaching." },
    classSize: { value: per(input.students, input.classes), numerator: input.students, denominator: input.classes, trend: [], note: "Every section counts as one class." },
    collection: {
      value: pct(input.collectedPkr, input.billedPkr),
      numerator: input.collectedPkr,
      denominator: input.billedPkr,
      trend: input.collectionTrend.map((row) => ({ label: row.label, value: pct(row.collectedPkr, row.billedPkr) })),
      note: "Looks at fees billed in the period and how much of them has been paid up to today, even if paid later.",
    },
    defaulters: {
      value: pct(input.overdueStudents, input.students),
      numerator: input.overdueStudents,
      denominator: input.students,
      trend: [],
      note: "Students with an unpaid fee past its due date, as of today.",
    },
    discount: {
      value: pct(input.discountPkr, input.grossBilledPkr),
      numerator: input.discountPkr,
      denominator: input.grossBilledPkr,
      trend: [],
      note: "Discounts on fees billed in the period.",
    },
    attendance: {
      value: pct(input.attendedDays, input.countedDays),
      numerator: input.attendedDays,
      denominator: input.countedDays,
      trend: input.attendanceTrend.map((row) => ({ label: row.label, value: pct(row.attendedDays, row.countedDays) })),
      note: "Uses the school's attendance rules for late and leave days.",
    },
    staffAttendance: {
      value: pct(input.staffAttendedDays, input.staffCountedDays),
      numerator: input.staffAttendedDays,
      denominator: input.staffCountedDays,
      trend: [],
      note: "Staff who signed in on school days, late arrivals included. Approved leave days are left out.",
    },
    pass: { value: pct(input.passed, input.resulted), numerator: input.passed, denominator: input.resulted, trend: [], note: "From the most recently calculated results this year." },
    girls: { value: pct(input.girls, input.boys + input.girls), numerator: input.girls, denominator: input.boys + input.girls, trend: [], note: "Students whose gender is recorded as male or female." },
  };

  return RATIO_DEFS.map((def) => {
    const v = values[def.key];
    return {
      key: def.key,
      group: def.group,
      label: def.label,
      question: def.question,
      unit: def.unit,
      value: v.value,
      display: formatRatio(def, v.value),
      numerator: { label: def.numeratorLabel, value: v.numerator },
      denominator: { label: def.denominatorLabel, value: v.denominator },
      status: ratioStatus(def, v.value),
      targetText: def.targetText,
      trend: v.trend,
      note: v.note,
    };
  });
}
