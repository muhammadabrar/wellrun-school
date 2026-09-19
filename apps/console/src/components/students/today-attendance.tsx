import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type AttendanceMark, type StudentList, type StudentProfile } from "@/lib/api";
import { todayIso } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const marks: { id: AttendanceMark; label: string; title: string; on: string }[] = [
  { id: "PRESENT", label: "P", title: "Present", on: "bg-success text-white" },
  { id: "ABSENT", label: "A", title: "Absent", on: "bg-danger text-white" },
  { id: "LATE", label: "L", title: "Late", on: "bg-orange text-white" },
  { id: "LEAVE", label: "Lv", title: "Leave", on: "bg-ink text-white" },
];

export type TodayAttendanceInput = {
  classId: string;
  studentId: string;
  status: AttendanceMark;
  firstName: string;
  lastName: string;
  rollNo: string;
  className: string;
  section: string;
};

export function todayAttendanceLabel(value: AttendanceMark | null) {
  if (!value) return "Not marked";
  if (value === "PRESENT") return "Present";
  if (value === "ABSENT") return "Absent";
  if (value === "LATE") return "Late";
  if (value === "LEAVE") return "Leave";
  return "Excused";
}

function patchTodayAttendance(queryClient: ReturnType<typeof useQueryClient>, studentId: string, status: AttendanceMark | null) {
  queryClient.setQueriesData({ queryKey: queryKeys.studentsRoot }, (old: unknown) => {
    if (!old || typeof old !== "object") return old;
    if ("items" in old && Array.isArray((old as StudentList).items)) {
      const list = old as StudentList;
      return {
        ...list,
        items: list.items.map((row) => (row.id === studentId ? { ...row, todayAttendance: status } : row)),
      };
    }
    if ("todayAttendance" in old && "id" in old && (old as StudentProfile).id === studentId) {
      return { ...(old as StudentProfile), todayAttendance: status };
    }
    return old;
  });
}

let attendanceToast: string | null = null;
const toastSubscribers = new Set<(message: string | null) => void>();

function publishAttendanceToast(message: string) {
  attendanceToast = message;
  toastSubscribers.forEach((notify) => notify(message));
  window.setTimeout(() => {
    if (attendanceToast !== message) return;
    attendanceToast = null;
    toastSubscribers.forEach((notify) => notify(null));
  }, 2800);
}

export function useTodayAttendance() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string | null>(attendanceToast);

  useEffect(() => {
    toastSubscribers.add(setToast);
    return () => {
      toastSubscribers.delete(setToast);
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async (input: TodayAttendanceInput) => {
      const result = await api.saveAttendance({
        classId: input.classId,
        date: todayIso(),
        records: [{ studentId: input.studentId, status: input.status }],
      });
      publishAttendanceToast(
        `${input.firstName} ${input.lastName} - ${input.rollNo} ${input.className} (${input.section}) Attendance marked`,
      );
      return result;
    },
    onMutate: async (input) => {
      const previous = queryClient.getQueriesData({ queryKey: queryKeys.studentsRoot });
      patchTodayAttendance(queryClient, input.studentId, input.status);
      return { previous };
    },
    onError: (_error, input, previous) => {
      for (const [key, data] of previous?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
      publishAttendanceToast(`Could not mark attendance for ${input.firstName} ${input.lastName}.`);
    },
  });

  return { mutate: mutation.mutate, toast };
}

export function TodayAttendance({
  value,
  disabled,
  onChange,
}: {
  value: AttendanceMark | null;
  disabled?: boolean;
  onChange: (status: AttendanceMark) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-medium text-muted-foreground">Today</p>
      <div className="flex gap-1" role="group" aria-label="Today's attendance">
        {marks.map((mark) => (
          <Tooltip key={mark.id}>
            <TooltipTrigger
              delay={400}
              render={
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={value === mark.id}
                  aria-label={mark.title}
                  className={cn(
                    "h-7 min-w-7 rounded-lg px-1.5 text-xs font-semibold transition-colors",
                    value === mark.id ? mark.on : "bg-paper text-muted-foreground hover:bg-line",
                  )}
                  onClick={() => onChange(mark.id)}
                >
                  {mark.label}
                </button>
              }
            />
            <TooltipContent>{mark.title}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
