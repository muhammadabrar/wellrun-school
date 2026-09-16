# Admissions + Students testing

Use this file while checking the console. Status values: `Not started` | `Ready` | `Pass` | `Fail`.

Demo logins after seed:

- School admin: `admin@greenfield.school` / `school123`
- Teacher: `teacher@greenfield.school` / `school123`

Console: `http://localhost:5173`

| Module | Scenario | Status | Notes |
| --- | --- | --- | --- |
| Auth | Sign in as school admin | Pass | Logged in as admin@greenfield.school on 15 Sep 2026 |
| Auth | Sign in as teacher | Ready | |
| Seed | Students show ADM-2026-#### IDs | Pass | List shows ADM-2026-0001 … 0008 |
| Seed | Admissions dashboard shows APP-2026-###### rows in several statuses | Pass | APP-2026-000001–000010 across draft through confirmed |
| Admissions | Dashboard metrics match the table | Pass | Open 8 plus draft/submitted/review/assessment/fee/docs/waitlist/confirmed chips |
| Admissions | Search by name, APP number, guardian, phone, CNIC | Ready | |
| Admissions | Filters + Clear filters | Ready | Campus and grade filters render |
| Admissions | Pipeline status and next action on detail | Pass | Yusuf Malik APP-2026-000003: Accept / waitlist / reject / withdraw |
| Wizard | New application, all 7 steps, data kept between steps | Ready | |
| Wizard | Required-field validation blocks submit | Ready | |
| Wizard | Search existing guardian / siblings | Ready | |
| Wizard | Assessment scores and interview | Ready | |
| Wizard | Document upload / replace / remove | Ready | |
| Wizard | Review then Submit | Ready | |
| Decisions | Accept | Ready | |
| Decisions | Waitlist | Ready | |
| Decisions | Reject (confirm dialog) | Ready | |
| Decisions | Withdraw (confirm dialog) | Ready | |
| Fees | Fee pending → record payment → receipt | Ready | |
| Confirm | Confirm admission creates ADM- student + enrollment | Ready | |
| Re-admission | Existing student gets a new enrollment, not a second student | Ready | Re-admit link on profile |
| Duplicates | Possible match shown; Continue anyway works | Ready | |
| Students | List search, filters, pagination | Pass | 8 students, ADM IDs, class/status filters |
| Students | Mobile card layout | Ready | Cards exist under `md:hidden` |
| Students | Bulk assign / promote / deactivate with confirmation | Ready | Bulk bar + confirm dialog in UI |
| Profile | Header, summaries, tabs load on open | Pass | Ahmed Khan ADM-2026-0001, attendance/fees/exam/years cards |
| Profile | Enrollment history not overwritten | Pass | Grade 4 2025-26 and Grade 5 2026-27 both present |
| Profile | Promote / transfer / deactivate | Ready | Buttons visible for admin |
| Profile | ID card print | Ready | Print ID card button present |
| Profile | Communication note / meeting | Ready | |
| Profile | Exam results | Ready | Latest exam 92% on overview |
| Quick admission | Faster flow still confirms student + enrollment | Ready | |
| Roles | Teacher cannot admit/confirm; can view assigned class | Ready | Students nav shown for teachers |
| UX | Loading skeletons, empty states, actionable errors | Pass | Dashboard showed retry on Neon cold start; admissions/students loaded |
| UX | No fake statistics, no console errors | Ready | Dashboard metrics are live invoice/attendance totals |
