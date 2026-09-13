# Wellrun School — Story index

**Product:** Wellrun School  
**Layer:** Parallel Layer 1 (Discover) + Layer 2 (Console) on a shared core. Layer 3 AI is deferred.  
**How to read:** `CORE-nn` shared foundation · `L1-nn` public discovery · `L2-nn` private school workspace.

| Field | Meaning |
| --- | --- |
| **ID** | Sequential within tag |
| **Phase** | `P0` shared core · `P1` first usable surfaces · `P2` discovery depth + attendance/timetable · `P3+` later L1/L2 |
| **Tag** | `CORE` · `L1` · `L2` |
| **Title** | Story name (full AC lives in the P0–P2 story pack) |

P0–P2 is the execute spine. Do not start Layer 3 from this index.

---

## P0–P2

| ID | Phase | Tag | Title |
| --- | --- | --- | --- |
| CORE-01 | P0 | CORE | Sign up with email and password |
| CORE-02 | P0 | CORE | Log in, log out, and keep a session |
| CORE-03 | P0 | CORE | Invite-based role assignment |
| CORE-04 | P0 | CORE | Reset password by email |
| CORE-05 | P0 | CORE | Canonical school entity |
| CORE-06 | P0 | CORE | Enforce `school_id` multi-tenancy |
| CORE-07 | P0 | CORE | Platform admin school CRUD |
| CORE-08 | P0 | CORE | City and area taxonomy |
| CORE-09 | P0 | CORE | Soft-delete and audit basics |
| CORE-10 | P1 | CORE | Claim an L1 profile |
| CORE-11 | P1 | CORE | Verify a school claim |
| CORE-12 | P1 | CORE | Activate L2 workspace after approved claim |
| CORE-13 | P1 | CORE | Invite staff into a claimed school |
| L1-01 | P1 | L1 | Seed and import schools |
| L1-02 | P1 | L1 | View public school profile |
| L1-03 | P1 | L1 | Browse school list |
| L1-04 | P1 | L1 | Contact school via WhatsApp |
| L1-05 | P1 | L1 | Edit public profile after claim |
| L1-06 | P2 | L1 | Filter school search |
| L1-07 | P2 | L1 | Compare up to 3 schools |
| L2-01 | P1 | L2 | Set up the campus |
| L2-02 | P1 | L2 | Set up the academic year |
| L2-03 | P1 | L2 | Manage classes and sections |
| L2-04 | P1 | L2 | Students CRUD and class assignment |
| L2-05 | P1 | L2 | Link parents to students |
| L2-06 | P1 | L2 | Teachers, assignments, and teacher login |
| L2-07 | P2 | L2 | Mark daily attendance by class |
| L2-08 | P2 | L2 | View the day's absent list |
| L2-09 | P2 | L2 | Configure timetable periods |
| L2-10 | P2 | L2 | Weekly timetable grid |
| L2-11 | P2 | L2 | Timetable conflict warning |

**Counts:** 31 stories · CORE 13 · L1 7 · L2 11 · P0 9 · P1 15 · P2 7

**Already dogfooded in v0.1 (partial):** CORE-02, CORE-05, CORE-06, L1-01, L1-02, L1-03, L1-07 (2 schools, not 3), L2-04 (read-only), L2-07 (present/absent only), plus a P3 fee payment slice that is not in P0–P2.

---

## Later L1 / L2 (P3+)

Layer 3 stays out. These continue Layer 1 and Layer 2 after P2.

| ID | Phase | Tag | Title |
| --- | --- | --- | --- |
| CORE-14 | P3 | CORE | Media upload for logo, cover, photos, videos |
| L1-08 | P3 | L1 | Events, videos, activities, and alumni on the profile |
| L1-09 | P3 | L1 | Parent reviews (submit + moderate) |
| L1-10 | P3 | L1 | Shortlist / save schools |
| L2-12 | P3 | L2 | Fee plans and generate invoices |
| L2-13 | P3 | L2 | Record payment and issue receipt |
| L2-14 | P3 | L2 | Outstanding fees and reminder queue |
| L2-15 | P3 | L2 | Month attendance register and student history |
| L1-11 | P4 | L1 | Profile completeness, OG image, claim polish |
| L2-16 | P4 | L2 | Admissions pipeline and enroll-to-student |
| L2-17 | P4 | L2 | Parent login (own kids’ attendance and fees) |
| L1-12 | P5 | L1 | City landing pages and map pin |
| L2-18 | P5 | L2 | Exam sessions and marks entry |
| L2-19 | P5 | L2 | Result cards published to parents |
| L1-13 | P6 | L1 | Discover desktop V2 |
| L2-20 | P6 | L2 | Notices (copy/SMS stub, not WhatsApp operator) |
| L2-21 | P6 | L2 | Reports pack (absent, unpaid, monthly) |
| L2-22 | P7 | L2 | HR contracts and leave |
| L2-23 | P7 | L2 | Payroll and payslip |
| L2-24 | P7 | L2 | Inventory stock in/out |

**Counts (P3+):** 20 stories · CORE 1 · L1 6 · L2 13 · P3 8 · P4 3 · P5 3 · P6 3 · P7 3

**Parked (not in this index):** Layer 3 AI OS, WhatsApp as operator, content series.

---

## Execute order

E1 Auth (CORE-01–04) → E2 School core (CORE-05, 07–09) → E3 Tenancy (CORE-06) → E4 L1 catalog (L1-01–04) → E5 Claim (CORE-10–13) → E6 L2 people (L2-01–06, L1-05) → E8 Attendance (L2-07–08) / E9 Timetable (L2-09–11) → E7 L1 depth (L1-06–07) → then P3+.
