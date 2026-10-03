# Console testing guide

How to test every module of the school console by hand, plus the automated checks that run in seconds.
Work top to bottom the first time; after that, jump to the module you changed.

Status values for the tick-boxes: `[ ]` not run · `[x]` pass · `[!]` fail (write the problem next to it).

---

## 0. Before you start

### Environment

| Thing | Value |
| --- | --- |
| Console | `https://console.wellrunsystem.com` |
| School admin | `admin@greenfield.school` / `school123` |
| Teacher | `teacher@greenfield.school` / `school123` (also `maths@…`, `primary@…`) |
| Platform admin | `ops@wellrun.school` / `school123` |
| Parent | `parent@wellrun.school` / `school123` (must **not** be able to enter the console) |



### Ground rules for every page

Apply these to **each** page you open. They are the checks people forget.

- [ ] Loading shows a skeleton, not a blank screen or a lone spinner
- [ ] Empty state says what is missing and offers the next action
- [ ] Error state is readable and has **Try again** (test by stopping the API)
- [ ] Network tab shows **one** GET per resource, no duplicates, no failed preflights
- [ ] Switching **campus** or **academic year** in the sidebar header refreshes the data on screen
- [ ] Keyboard: Tab reaches every control, focus ring visible, Enter/Space activate buttons
- [ ] Narrow the window to phone width: no horizontal page scroll
- [ ] Reloading the page keeps you on the same page and signed in
- [ ] Long lists are paginated (see **§11.5**): never a silent cut-off, always "Showing 21–40 of N"

---

## 1. Sidebar and navigation

**Login as school admin.** Expected order, top to bottom:

| Group | Items |
| --- | --- |
| Overview | Dashboard |
| People | Admissions ▸ (Applications, New application, Quick admission) · Students · Staff |
| Classroom | Attendance ▸ (Overview, Mark attendance, Absent list, Month register, Reports, Settings) · Timetable |
| Exams | Overview · Examinations ▸ · Assessments ▸ · Marks ▸ · Results ▸ · Analytics ▸ · Settings ▸ |
| Finance | Fees ▸ (Overview, Invoices, Payments, Generate monthly fees, Reports, Fee structures, Fee Heads, Discounts, Settings) · Payroll |
| School setup | Campuses · Academic years · Classes & subjects · Public profile |

- [ ] Every link opens the right page and the breadcrumb title matches the sidebar label
- [ ] The active item is highlighted; the group containing it is open on load
- [ ] `/admissions` highlights **Applications**; `/admissions/new` highlights **New application** only (never both)
- [ ] Opening an application (`/admissions/<id>`) keeps **Admissions** open and highlights **Applications**
- [ ] Opening a student, staff member, invoice or exam keeps its parent item highlighted
- [ ] Collapse to icons (trigger in the header): icons remain, tooltips show the label
- [ ] Old links still work: `/absent` → Absent list, `/teachers` → Staff, `/fees/workspace` → Invoices, `/exams/results` → Class results

**Login as teacher** — sidebar is: **Me** (My portal) · **People** (Students) · **Classroom** (Attendance ▸ Mark attendance, Absent list, Month register, Reports · Timetable) · **Exams**.

- [ ] No Dashboard, Finance, School setup, Attendance Overview/Settings
- [ ] Exams has no Settings, Create exam, Pending verification or Result sheets
- [ ] Opening `/` redirects to `/me`
- [ ] Typing an admin-only URL (e.g. `/fees`, `/payroll`, `/campuses`) does not show admin data (403/redirect/empty, never real figures)

**Login as platform admin** — only **Platform ▸ Claims & schools**; `/` redirects to `/admin`.

**Login as parent** — bounced back to the login page.

---

## 2. Auth, setup and access

| # | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| A1 | Sign in | Valid admin credentials | Lands on Dashboard |
| A2 | Bad password | Wrong password | Clear error, no stack trace, stays on login |
| A3 | Sign out | User menu → sign out | Back on login; back button does not reveal data |
| A4 | Register a school | `/register`, fill form | Account created, redirected into **Setup** wizard |
| A5 | Setup wizard | Organization → Campus → Academic year → Classes → Subjects | Progress bar advances; earlier steps revisitable; later steps locked until done |
| A6 | Resume setup | Quit half-way, sign in again | Resumes at the saved step; console is unreachable until setup completes |
| A7 | Forgot / reset password | `/forgot-password`, then the emailed link `/reset-password?token=…` | New password works; old one does not; mismatched confirm is rejected |
| A8 | Invite | Staff ▸ member ▸ invite; open `/invite?token=…` | Sets password, joins the right school with the right role |
| A9 | Tenant isolation | Sign in to a second school | Sees none of the first school's students, fees or staff |

---

## 3. Dashboard (`/`, school admin only)

The dashboard is one request (`GET /console/dashboard`) and every number links to the module behind it. Test it **by cross-checking against the module pages** — a dashboard number that disagrees with its module is a bug.

### Layout

- [ ] Header greets by first name and shows today's full date and school name
- [ ] Badge reads **School day**, or **Holiday: <name>** / **School closed today** on non-working days
- [ ] Fee setup checklist appears only while fees are not yet configured
- [ ] Six KPI tiles: Students · Attendance today · Collected this month · Outstanding fees · Staff · Open admissions
- [ ] Below: Needs your attention + Quick actions · Attendance trend + Fee collections · Recent activity + Admissions / Exams / Payroll panels
- [ ] While loading: skeleton in the same shape. On API failure: "Unable to load the dashboard" with **Try again**

### Numbers (cross-check)

| Tile / panel | Verify against | Expected |
| --- | --- | --- |
| Students | Students list, filtered to current campus + year, status active | Same count; "+N this month" = students created since the 1st |
| Attendance today | Attendance ▸ Overview (today) | Same %, present + late / absent split |
| Registers still open | Attendance ▸ Overview → classes with 0 marked | Same classes; clicking a chip opens Mark attendance for that class |
| Collected this month | Fees ▸ Overview "Collected this month" | Same total (compact form, hover shows the exact Rs. amount) |
| vs last month | Sum of last month's payments | Percentage = (this − last) ÷ last; hidden when last month is 0 |
| Outstanding / Overdue | Fees ▸ Invoices (unpaid, then Overdue only) | Same totals and invoice counts |
| Staff | Staff list: active / on leave | Same |
| Open admissions | Admissions summary chips | Excludes drafts, confirmed, rejected, withdrawn |
| Papers to verify / Corrections | Exams ▸ Marks ▸ Pending verification / Corrections | Same counts |
| Next 7 days | Exams ▸ Exam calendar | Same papers, soonest first, max 5 |
| Payroll | Payroll for this month | "X of Y paid · Z generated · N in draft" |

### Behaviour

- [ ] **Campus switch** — change campus in the header: every tile updates to that campus
- [ ] **Year switch** — change year: students, admissions, exams and outstanding fees follow the year; collected-this-month stays school-wide
- [ ] **Attention list order** — overdue fees (red) first, then warnings (orange), then payroll notes (blue)
- [ ] **Attention clears** — mark a missing register, review an application, verify a paper → refresh: that item is gone
- [ ] **All caught up** — with nothing pending, a green "You're all caught up" message replaces the list
- [ ] **Closed day** — set today as a holiday (Attendance ▸ Settings): no "registers not marked" or low-attendance warnings appear
- [ ] **Low attendance** — mark today below the threshold: "Attendance is N% today" appears
- [ ] **Payroll nudge** — after the 25th with no payslips generated: "This month's payroll isn't generated"; with draft payslips at any time: "N payslips still in draft"
- [ ] **Recent activity** — record a payment: it appears at the top within a refresh, "Just now", and clicking opens that invoice. Same for a new admission application, a directly admitted student, a submitted exam paper, and a new staff member
- [ ] **Quick actions** — all eight open the right page
- [ ] **Empty school** — a brand-new school shows zeros, "Collections appear here once payments are recorded", "No activity yet", no NaN or `Infinity`
- [ ] **Teacher** cannot call the endpoint (403) and is redirected to `/me`
- [ ] **Network** — page load makes exactly one dashboard request, plus one fee-setup-status request while the checklist is shown

---

## 3b. Reports hub (`/reports`, school admin only)

Open **Reports** in the sidebar. Every report takes its own dates and class, and can be printed or downloaded.

| # | Scenario | Expected |
| --- | --- | --- |
| R1 | Open **Reports** | Ratio analysis card on top, then reports grouped as Students, Attendance, Fees, Exams, Staff and payroll; the search box filters by word |
| R2 | Teacher opens `/reports` or calls the API | Refused (403): reports are for the school admin |
| R3 | Open **Strength by class** | One row per class with boys, girls and total; totals row; bar for each class; matches the Students list counts |
| R4 | Open **Fee collection**, switch By month / By day / By payment method / By class | Rows regroup; amounts add up to the same total each time; credit applied from a student's balance is not counted as money received |
| R5 | Void or refund a payment, then open **Voided and refunded payments** for today | It appears with its reversal date; **Fee collection** no longer counts it |
| R6 | **Outstanding fees by age** | Five age bands; the total equals the unpaid amount on the Fees overview; unpaid bills not yet due sit in "Not yet due" |
| R7 | **Defaulters** with a class chosen | Only that class; biggest balance first; guardian phone shown; days overdue match the oldest due date |
| R8 | **Students below the attendance line** with the limit left blank, then 90 | Blank uses the school's attendance limit; a higher limit lists more students; lowest attendance first |
| R9 | **Attendance by class** for a month | Percentages follow the school's rules for late and leave days (same as the Attendance reports page) |
| R10 | **Class results** and **Subject results** | Open on the newest exam; choosing another exam or term updates both; with no results yet, a clear "No results have been calculated yet" |
| R11 | **Payroll cost by month** for the last six months | A row per month even with no payslips; Not yet paid = net pay minus paid |
| R12 | **Payroll by department** for a month | One row per department; staff with no department appear as "No department" |
| R13 | Download **Excel** and **CSV** on a long report (for example Guardian directory) | The file has every row, not just the 50 on screen; numbers are numbers in Excel; the CSV opens with Urdu names intact |
| R14 | **Print / PDF** | Only the report prints (no sidebar), with its title, dates and every row, not just the current page |
| R15 | A range whose start is after its end, or over two years | A clear message, not a blank page |
| R16 | Switch the campus or academic year in the header | Reports refresh for that campus and year |
| R17 | **Ratio analysis** for this month | Nine cards; each shows the value, a Good / Watch / Needs attention label, and the working (for example "Students 840 ÷ Teachers 20"); a brand-new school shows dashes, never NaN |
| R18 | Cross-check ratios | Students per teacher equals active students divided by teachers who have a class or lesson this year; Fee collection equals paid divided by billed for bills issued in the range |
| R19 | Presets (This month, Last month, Last 3 months, This year) | Dates change and the cards refresh |
| R20 | Export an audited report | Settings → audit shows "report_exported" with the row count |

## 4. People

### 4.1 Admissions

| # | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| AD1 | List and summary | Open Applications | Status chips match table; counts respect campus and year |
| AD2 | Search and filters | Search name, APP number, guardian, phone, CNIC; filter status/class; **Clear filters** | Results narrow and reset |
| AD3 | New application, 7 steps | New application → complete every step | Data kept between steps; Back never loses input |
| AD4 | Validation | Leave required fields empty, press Next/Submit | Each error is shown at its field; submit blocked |
| AD5 | Guardian and siblings | Search an existing guardian | Attached instead of duplicated; sibling fees shown |
| AD6 | Assessment | Record test scores and interview | Saved; status moves to assessment/interview pending |
| AD7 | Documents | Upload, replace, remove | Preview works; size/type limits enforced |
| AD8 | Submit | Review → Submit | Status `Submitted`, APP number issued |
| AD9 | Decisions | Accept · Waitlist · Reject · Withdraw | Reject and Withdraw ask for confirmation; status and history update |
| AD10 | Fee pending | Accepted → record the admission fee | Receipt issued; moves toward confirmation |
| AD11 | Confirm admission | Confirm | Student created with `ADM-<year>-####`, enrolled in the target class |
| AD12 | Re-admission | Re-admit an existing student | New enrollment on the same student, no second student |
| AD13 | Duplicate warning | Enter an existing CNIC/name+DOB | Possible match shown; **Continue anyway** works |
| AD14 | Quick admission | Quick admission page | Student + enrollment created in one step |
| AD15 | Resume draft | Leave mid-wizard, open from list | **Continue** returns to the saved step |

### 4.2 Students

- [ ] List: search, class/status filters, pagination; desktop table and mobile cards
- [ ] Bulk bar: assign class · promote · deactivate — each asks for confirmation and reports how many changed
- [ ] Profile: header, attendance, fees, exam and year summaries load; tabs load on demand
- [ ] Enrollment history shows every year without overwriting older rows
- [ ] Edit student (`/students/<id>/edit`): save changes; admission number is not editable
- [ ] Promote / transfer / deactivate from the profile
- [ ] Print ID card; add a communication note / meeting
- [ ] Guardian details attach and display; photo upload works
- [ ] Teacher sees only students in their assigned classes and cannot admit or confirm

### 4.3 Staff

- [ ] Directory: search and filter by status/campus
- [ ] **Add staff** — required fields validated; CNIC and name cannot be edited afterwards
- [ ] Detail: profile, contracts, status history, timetable, assignments
- [ ] Add a **contract** (type, dates, basic salary, allowances) — appears in history
- [ ] Change **status** (on leave, suspended, resigned, terminated) with a reason and effective date; history records it; staff are never deleted
- [ ] Assign a teacher to a class + subject; remove the assignment
- [ ] Create a login for a staff member / send an **invite**; the invite link works once
- [ ] Teacher cannot open other staff records or the directory

### 4.4 Staff attendance and leave

Staff are checked in automatically the first time they use the system on a school day. An admin reads attendance and decides leave; nobody edits a mark.

| # | Scenario | Expected |
| --- | --- | --- |
| SA1 | A teacher signs in on a school day before the start time, then opens **My portal** | "My attendance today" shows Present and the check-in time |
| SA2 | A teacher's first activity is after the start time plus grace (for example 8:20 with an 8:00 start and 15 minutes grace) | Late, "20 minutes after the 8:00 am start" |
| SA3 | Arrival exactly at start plus grace (8:15) | Still on time |
| SA4 | Sign in again, or keep using the system, later the same day | The check-in time does not change |
| SA5 | A teacher who stays signed in for days (the session lasts a week) uses the system the next morning | A new check-in for the new day, without signing in again |
| SA6 | Sign in on a Sunday or a holiday | Nothing is recorded; the portal says the school is closed |
| SA7 | Admin opens **Staff → Attendance** | Today's list: status, check-in time and minutes late per person; chips count present, late, absent, on leave and not in yet; people who haven't used the system today show "Not in yet" |
| SA8 | Admin looks at a past day where someone never signed in | Absent, even before the nightly job has run |
| SA9 | Next morning after 00:15 | Past days with no activity are saved as Absent (check the Whole month view and the report; nothing changes in the list) |
| SA10 | **Whole month** view | One row per person with on time, late, absent, on leave and a percentage; only finished days are counted; leave days never lower the percentage |
| SA11 | Admin tries to change a mark (API call to edit) | No such action exists |
| SA12 | Excel and CSV on both views | Files contain every person |
| SA13 | Change the start time or grace in **Attendance settings** | The day view note and new check-ins use the new values; earlier check-ins keep their saved status |
| SA14 | A staff member whose login isn't linked to a staff record | Their portal says to ask the admin; nothing is recorded |
| LV1 | A teacher asks for leave from **My leave** (kind, dates, reason) | Request appears as "Waiting for approval"; the admin sees it in **Staff → Leave requests** with the number of school days |
| LV2 | Leave starting more than 7 days ago, longer than 60 days, or covering only a Sunday or holiday | Refused with a plain reason |
| LV3 | A second request overlapping an existing waiting or approved one | Refused: "You already have leave on some of those days" |
| LV4 | Admin approves with a note | The teacher sees "Approved" and the note; those days show "On leave" in attendance and are left out of the percentage |
| LV5 | Admin approves leave that includes a day already saved as absent | That day becomes On leave |
| LV6 | Admin declines with a reason | The teacher sees "Not approved" and the reason; days stay absent if they don't attend |
| LV7 | Deciding the same request twice (second tab) | "This request has already been decided" |
| LV8 | A teacher withdraws a waiting request, or an approved one that hasn't started | Status becomes Cancelled; withdrawing approved leave that has started is refused |
| LV9 | A teacher calls the admin's leave list or decision endpoint | Refused (403) |
| LV10 | A teacher on approved leave signs in that day | Recorded as On leave, not Present |
| LV11 | **Reports → Staff attendance** and **Ratio analysis → Staff attendance** | Report matches the Whole month view for the same dates; the ratio shows the working and a Good, Watch or Needs attention label |

---

## 5. Classroom

### 5.1 Attendance

| # | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| AT1 | Overview | Attendance ▸ Overview, pick a date | Today's %, present/absent/late/leave, classes not marked, 30-day trend, students below threshold |
| AT2 | Mark a class | Mark attendance → class → mark statuses → Save | Saved; class shows as marked on Overview and Dashboard |
| AT3 | Default status | Open an unmarked class | Sensible default; **mark all present** works; changes are individually editable |
| AT4 | Statuses | Present, Absent, Late, Leave, Excused | Percentages follow the Settings switches (late counts present, leave counts) |
| AT5 | Edit window (teacher) | Teacher edits yesterday with `teacherEditDays = 0` | Blocked with a clear message; allowed when the window is widened |
| AT6 | Non-working day | Pick a Sunday / holiday | Marking blocked, "school is closed" notice |
| AT7 | Month register | Register ▸ choose class + month | Grid of students × days; edit a cell; totals recalc |
| AT8 | Absent list | Absent list for today and another date | Lists the absent / leave students for that date; count matches the Dashboard absent figure |
| AT9 | Reports and register export | Reports ▸ filters, page through, export (Excel / CSV / print); Register ▸ export | Row counts match the screen; export respects the row limit |
| AT10 | Settings | Change working weekdays, threshold, edit window, counting switches; add / edit / delete a holiday (school-wide and campus-only) | Saved; Overview and reports reflect it |
| AT11 | Teacher first-period flow | Teacher opens Attendance | Goes straight to Mark attendance for their first class |
| AT12 | Student view | Student profile ▸ attendance | Year %, per-term %, monthly trend, calendar, recent non-present days |

### 5.2 Timetable

- [ ] Create, edit and delete **periods** (label, start, end)
- [ ] Add a **lesson**: class + subject + teacher + weekday + period; clash on the same teacher/period is rejected
- [ ] **Generate** a draft timetable; review before accepting
- [ ] Delete a lesson
- [ ] Teacher's portal shows their own week

---

### 5.3 Diary and notices

Teachers write the diary for their own classes; admins read it and can take an entry down. Notices are written by admins and read by teachers.

| # | Scenario | Expected |
| --- | --- | --- |
| D1 | Teacher opens **Diary** | Only the classes they teach are listed; the first is selected; today's entries (if any) show |
| D2 | Teacher with no class assignment | "No classes assigned to you yet" empty state, no composer |
| D3 | Add homework for a subject they teach, with a due date and a photo | Saved; appears in the list with subject, type, due date and photo; toast shown |
| D4 | Subject list in the composer | Only subjects this teacher teaches in this class, plus "General (whole class)" |
| D5 | Subject teacher posts a General **Homework** | Refused with a clear message; a General **Note** is accepted |
| D6 | Class teacher (assigned with no subject) posts for any subject in their class | Accepted |
| D7 | Due date before the diary date | Refused: "Due date can't be before the diary date" |
| D8 | Diary date two days ago, or more than a month ahead | Refused with a message about the allowed range |
| D9 | Edit and delete own entry written today | Works. Entries more than a day old show no Edit or Delete, and the API refuses if called directly |
| D10 | Try to edit another teacher's entry (API call) | 403 "You can change only your own diary entries" |
| D11 | **Copy to sections** on an entry for 5A | Lists only other sections of the same grade where they teach that subject; copies appear for the same day |
| D12 | Write Urdu text in the title and body | Text aligns right-to-left in the box and in the list |
| D13 | Closed academic year | Posting and editing are refused with the closed-year message |
| D14 | **My portal** (teacher) | "Today's diary" lists today's lessons; "Write diary" opens the composer for that class and day; classes already written show "Written"; on a holiday it says so |
| D15 | Admin opens **Diary** | No composer. Overview shows "X of Y classes have a diary"; clicking a class under "Nothing written yet" selects it; admin can remove any entry |
| D16 | Admin opens the overview on a Sunday or a holiday | Shows that the school is closed, not a list of missing classes |
| D17 | Page, campus and year switchers | List refreshes; page number clamps after deleting the last entry on a page |
| N1 | Admin posts a notice for everyone | Appears at the top of the list; teachers see it |
| N2 | Admin posts a notice for chosen classes | Teachers of those classes see it; teachers of other classes do not |
| N3 | Choosing "Chosen classes" with none selected | Refused: "Pick at least one class, or send it to everyone" |
| N4 | Pin, edit and delete a notice | Pinned notices sort first; edits show; delete asks for confirmation |
| N5 | Teacher opens **Notices** | Read-only: no New, Pin, Edit or Delete |

## 6. Exams

| # | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| E1 | Overview | Exams ▸ Overview | Upcoming papers, paper status counts, active exams, pending corrections |
| E2 | Settings first | Settings ▸ Terms, Grading systems, Result rules, Ranking rules, Report card templates | Create/edit/delete each; a default grading scale and template exist |
| E3 | Create exam | Create exam → classes, subjects, dates | Draft exam with a paper per class × subject |
| E4 | Schedule | Schedule papers (date, time, room, invigilator) | Clashes reported; appears on Exam calendar |
| E5 | Duplicate / delete | Duplicate an exam; delete a draft | Copy has papers; published exams cannot be deleted |
| E6 | Assessments | Quizzes · Assignments · Practicals · Viva | Quick create per kind; list filters by class |
| E7 | Enter marks | Marks ▸ Enter marks → paper | Marks, absent/leave markers, remarks; max/pass marks enforced; save draft |
| E8 | Submit | Teacher submits a paper | Status `Submitted`; locked for the teacher |
| E9 | Verify | Admin ▸ Pending verification → Approve / Return with note | Approved moves to Approved; returned reopens for the teacher with the note |
| E10 | Corrections | Teacher requests a correction on an approved paper; admin approves / rejects | Marks change only after approval; old/new values kept |
| E11 | Compute results | Results ▸ compute for exam / term / annual | Totals, percentages, grades, GPA and ranks per rules |
| E12 | Publish | Publish results | Status `Published`; further edits blocked |
| E13 | Class / student results | Class results, Student results | Match the marks entered; ties ranked per Ranking rules |
| E14 | Result sheets and report cards | Generate / print / PDF | Header, grades, attendance, remarks, signatures per the template |
| E15 | Analytics | Class, Subject, Student performance | Charts render; empty exam shows a helpful message |
| E16 | Teacher scope | Teacher opens Marks | Only their class + subject papers can be entered |

### 6.1 Question bank

Questions kept for reuse, per grade and subject. A paper takes its own copy, so changing or archiving a bank question never changes a paper that exists. Papers can freely mix bank questions with questions typed on the spot.

| # | Scenario | Expected |
| --- | --- | --- |
| QB1 | Open **Exams → Question bank** as a teacher | Only the grades and subjects they teach are offered; the list shows questions for those only |
| QB2 | Open it as an admin | Every grade and subject is offered |
| QB3 | **Add a question**: pick grade and subject, then write a multiple choice question with a marked answer | Saved; appears in the list with its kind, difficulty, marks and the correct option ticked |
| QB4 | Save a multiple choice question with one option, no answer, or an answer pointing at an empty option | Refused with a plain reason, nothing saved |
| QB5 | Add a true/false, a matching and a short-answer question | Each uses the right fields; matching needs two complete pairs |
| QB6 | Add the same question again, with different capitals, spacing or punctuation | Refused: "That question is already in the bank" |
| QB7 | Same stem with different multiple choice options | Accepted: it is a different question |
| QB8 | Add an Urdu question with the right-to-left switch on | Shown right to left in the list, the editor and the picker |
| QB9 | Link a question to a syllabus topic | Only that grade and subject's topics are offered; the topic shows on the question and filters the list |
| QB10 | Add tags like "Grammar, nouns" | Saved lower case without repeats; shown as hashtags |
| QB11 | Filter by grade, subject, kind, difficulty, topic, "Only mine", and search a word | Each narrows the list; the page resets to the first; the filters stay in the address |
| QB12 | A teacher tries to edit another teacher's question | No Edit button; the API refuses (403). An admin can edit any |
| QB13 | Edit your own question's wording | Saved; the grade, subject and kind can't change |
| QB14 | Edit it into exactly another existing question | Refused as a duplicate |
| QB15 | **Archive** a question, then tick Archived and **Restore** it | It leaves the list and the paper picker, then comes back |
| QB16 | Open a draft paper, a section of a kind that has bank questions, and press **Add from bank** | The picker shows only this paper's grade and subject and this section's kind |
| QB17 | Tick three questions and add them | They appear in the section with their marks; the bank shows their use count up by one; the paper's total marks update |
| QB18 | Open the picker again | Those three show "Already in this paper" and can't be ticked |
| QB19 | Edit or archive a bank question that a paper uses | The paper's copy is unchanged |
| QB20 | Write a new question in a section and press **Save to bank** | A tick shows it is in the bank; it appears in the bank list; the next teacher of that subject can use it |
| QB21 | Press Save to bank on a question that matches one already in the bank | Nothing is duplicated; the question is linked to the existing one |
| QB22 | Save an unfinished question (a multiple choice with no marked answer) to the bank | Refused with what is missing |
| QB23 | A comprehension section | No Add from bank or Save to bank; a reading passage's questions can't stand alone |
| QB24 | Add a multiple choice bank question to a short-answer section through the API | Refused: the kinds don't match |
| QB25 | An approved or submitted paper | The picker can't add questions; Save to bank still works on its questions |
| QB26 | A closed academic year | Papers stay read-only; the bank itself still works |
| QB27 | A teacher calls the bank API for a grade or subject they don't teach | Refused (403) or empty, never another subject's questions |

---

## 7. Finance

### 7.1 Fees

Recommended order: **Fee Heads → Fee structures → Generate → Invoices → Payments**.

| # | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| F1 | Setup checklist | New school Dashboard | Checklist guides: add fee heads → set fees per class → generate |
| F2 | Fee Heads | Add tuition, admission, exam, etc.; edit; delete unused | Duplicate names rejected; used heads cannot be deleted |
| F3 | Fee structures | Per class: add heads and amounts; **copy fee heads to all classes** | Classes without a structure are flagged; edits save |
| F4 | Discounts | Create fixed and percent discounts; assign to a student | Applies to next generated invoices |
| F5 | Generate preview | Generate monthly fees → choose month, classes → **Preview** | Count and total shown; no invoices created yet |
| F6 | Generate | Confirm | Invoices created once; running again for the same month does not duplicate |
| F7 | Invoices | Filter unpaid / overdue / paid, class, month, previous years | Balances and statuses correct; PDF **challan** downloads |
| F8 | Collect payment | Pay a full invoice | Status `Paid`, receipt issued, appears in Payments and on Dashboard |
| F9 | Partial payment | Pay part | Status `Partially paid`; balance correct |
| F10 | Overpayment | Pay more than owed | Excess held as student **credit** and can be applied |
| F11 | Void / refund | Void a payment; refund another | Balances restore; both are recorded, never silently deleted |
| F12 | Cancel invoice | Cancel an unpaid invoice | Excluded from outstanding |
| F13 | Overdue | Invoice past due date (overdue job flips it) | Status `Overdue`; counted in Overview, Dashboard, attention list |
| F14 | Receipt | Open and print/PDF a receipt | Number, student, amount, method, school letterhead |
| F15 | Reports | Fees ▸ Reports with filters | Totals reconcile with Payments and Invoices |
| F16 | Settings | Due day, late fee mode, receipt text | Applied to newly generated invoices |
| F17 | Student ledger | Student profile ▸ fees | Invoices, payments, credits in order; balance matches |
| F18 | Previous-year arrears | Close a year with unpaid invoices | Shown separately; carried as arrears on new challans |

### 7.3 Accounts (cash book)

A simple cash book. Fee payments and paid salaries arrive by themselves; everything else is a voucher written by hand. Vouchers are never edited or deleted: a mistake is cancelled and written again.

| # | Scenario | Expected |
| --- | --- | --- |
| AC1 | First visit to **Accounts** | A cash box and a bank account exist, with the usual categories, both at zero from today |
| AC2 | **Accounts and categories**: set opening balances and dates | Balances count from that date; nothing earlier is included |
| AC3 | Add a second bank account; switch off the only cash account | The second is added; switching off the last cash or bank account is refused with a reason |
| AC4 | Write a **Money out** voucher (rent, from the bank) | Gets the next VCH number; appears in Vouchers and the ledger; the bank balance drops |
| AC5 | Money out for more than the account holds | A warning appears but it can still be saved; the balance shows in red |
| AC6 | Write a **Money in** voucher (a donation) | Counted as income; the category list shows income categories only |
| AC7 | **Move money** from cash to bank | Cash goes down, bank goes up by the same amount; total money held is unchanged; it is not counted as income or spending |
| AC8 | Date a voucher in the future, or before the account's opening date | Refused with a plain reason |
| AC9 | Try to use Fee collection or Salaries on a voucher | Refused: these come from fees and payroll |
| AC10 | Record a fee payment in cash, then in bank, then pay a salary | Cash payment raises the cash balance; bank payment raises the bank balance; the paid salary lowers its account; all appear in the day book without any voucher |
| AC11 | Void a fee payment from Fees | It disappears from the ledger and the balances |
| AC12 | Apply a student's credit to an invoice | Not counted as money received |
| AC13 | **Cancel** a voucher with a reason | Stays in the list marked Cancelled with who and why; balances reverse; it can't be cancelled twice |
| AC14 | **Ledger** for one account | Opening balance, lines with a running balance, closing balance; opening + in - out = closing |
| AC15 | Ledger over a later period | Opening is what the account held that morning, not its opening balance |
| AC16 | Ledger for **All accounts** | Every line with its account; transfers show once and are not in either total; no running balance |
| AC17 | Voucher page **Print** | Prints the voucher with signature lines, without the sidebar |
| AC18 | Ledger Excel, CSV and Print | Contain every line, not only the page on screen |
| AC19 | **Overview** | Money held, this month's in and out, the last six months as bars, the month by category, latest activity; figures match the ledger |
| AC20 | Reports: Income and spending by month, by category | Match the Overview for the same dates |
| AC21 | Ratio analysis: salaries, spending and surplus | Show the working; a month that spends more than it receives shows a negative surplus flagged as needing attention |
| AC22 | A teacher opens `/finance` or calls its API | Refused (403) |

### 7.4 Inventory

| # | Scenario | Expected |
| --- | --- | --- |
| IN1 | Add a consumable with a reorder level, and an asset | Both appear; the asset has no reorder level |
| IN2 | Add the same name in the same place twice | Refused with a pointer to the existing item |
| IN3 | **Count stock** to 60 on a new item | On hand becomes 60; the history shows a stock count |
| IN4 | **Bought** 40 at Rs. 1,480 with "Record the money spent" ticked | Stock goes up by 40; cost of one updates; a payment voucher appears in Accounts for Rs. 59,200 from the cash account with the supplier and a note |
| IN5 | Bought with the box unticked, or at a cost of zero | Stock changes but no voucher is written |
| IN6 | Choose another account for the purchase | The voucher is paid from that account |
| IN7 | **Given out** more than is in stock | Refused: "Only N in stock" |
| IN8 | Give out, return and mark damaged | Stock moves down, up, down; the history shows who and why |
| IN9 | A stock count equal to the current stock | Refused: it matches what is already there |
| IN10 | A consumable falls to its reorder level | Shows "Running low" on the list and the item; the tile counts it and filters to it |
| IN11 | **Cancel purchase** while all of it is still on the shelf | Stock goes back down and the voucher is cancelled in Accounts |
| IN12 | Cancel a purchase after some of it was given out | Refused with how many are left and a pointer to a stock count |
| IN13 | Try to cancel the voucher directly in Accounts | Refused: cancel the purchase on the item instead |
| IN14 | Mark an asset Being repaired or Disposed of | State changes; it shows in the list filter |
| IN15 | Switch an item off | Hidden unless "Include switched-off items" is ticked; recording stock on it is refused |
| IN16 | Two people record stock for the same item at once | One is told the stock changed and to try again; stock never goes below zero |
| IN17 | Reports: Stock and asset value | Matches the list and the "Worth now" tile |
| IN18 | A teacher opens `/inventory` or calls its API | Refused (403) |

### 7.2 Payroll

- [ ] Open Payroll for the current month; switch month
- [ ] **Generate** payslips: one per active staff member with a contract; staff without a contract are called out
- [ ] Edit a draft payslip: add allowances and deductions; net recalculates
- [ ] **Finalize** one and **Finalize all**; finalised payslips are locked
- [ ] **Pay** a payslip (date, method, reference); status `Paid`
- [ ] **Cancel** a payslip; regenerate works
- [ ] Payslip page prints cleanly
- [ ] Staff sees their own payslip in **My portal** and cannot see anyone else's
- [ ] Dashboard Payroll panel counts match

---

## 8. School setup

### 8.1 Campuses
- [ ] Add and edit a campus; the header **campus switcher** lists it
- [ ] Switching campus filters students, classes, attendance, fees and the dashboard
- [ ] A single-campus school works without any switcher confusion

### 8.2 Academic years

| # | Scenario | Expected |
| --- | --- | --- |
| Y1 | Create year with dates | Rejects overlapping or reversed dates |
| Y2 | New year wizard (`/academics/years/new`) | Copies classes/subjects/fees setup if chosen |
| Y3 | Activate | Only one year is active at a time |
| Y4 | Close-check then **Close** | Lists blockers (unmarked, unpublished, unpaid); closed year is read-only with a banner |
| Y5 | Reopen | Editing allowed again |
| Y6 | Promotion preview then promote | Students move to next class; history retained; failures listed |
| Y7 | Delete | Only allowed for an empty planning year |

### 8.3 Classes & subjects
- [ ] Add, rename and delete classes and sections (delete blocked while students are enrolled)
- [ ] Subject library: seed defaults, add, delete
- [ ] Assign subjects to a class; apply one class's setup to others
- [ ] Changes appear in Timetable, Exams and Attendance class pickers

### 8.4 Public profile
- [ ] Edit about, contact, facilities, fees, location; upload logo, cover and photos
- [ ] Preview matches the public Discover page after saving

---

## 9. Role and permission matrix

Try each row; the "No" cells matter most.

| Area | School admin | Teacher | Platform admin | Parent |
| --- | --- | --- | --- | --- |
| Dashboard | Yes | Redirected to My portal | Redirected to Admin | No console |
| Admissions | Yes | No | No | No |
| Students | All | Own classes | No | No |
| Staff / Payroll | Yes | Own portal + payslips only | No | No |
| Accounts and inventory | Yes | No (refused) | No | No |
| Staff attendance | Read-only | Own check-in on My portal | No | No |
| Leave | Approve or decline all | Ask for and withdraw own | No | No |
| Attendance | All + settings | Own classes, edit window applies | No | No |
| Reports and ratio analysis | Yes | No (refused) | No | No |
| Diary | Read all, remove any | Write for own classes and subjects | No | Reads it in the parent portal |
| Notices | Write, pin, delete | Read those that reach their classes | No | Reads them in the parent portal |
| Exams | Everything | Own subjects: marks + correction requests | No | No |
| Fees | Yes | No | No | No |
| School setup | Yes | No | No | No |
| Claims & schools | No | No | Yes | No |

---

## 10. End-to-end smoke test (15 minutes)

Run after any big change. Everything should flow without a workaround.

1. Sign in as admin → Dashboard loads with no console errors.
2. **Admissions** → New application → submit → accept → record admission fee → confirm.
3. **Students** → the new student exists with an ADM number and a class.
4. **Fees** → Generate this month's fees → open the student's invoice → collect part → collect the rest.
5. **Dashboard** → Collected this month rose; Recent activity shows the payment and the admission.
6. **Attendance** → Mark the student's class with one absence → Dashboard shows the attendance %; the register attention item disappears.
7. **Staff** → Add a staff member with a contract → **Payroll** → generate, finalize, pay.
8. **Exams** → Create exam → schedule → teacher enters and submits marks → admin approves → compute → publish → student result and report card open.
9. Switch **campus** and **year** — Dashboard, Students and Fees all follow.
10. Sign in as **teacher** → sidebar is the teacher set; admin URLs show nothing.

---

## 11. Performance and network checks

- [ ] Hard reload on `/`: only the dashboard chunk loads, not every page's JavaScript
- [ ] Navigating to another page loads only that page's chunk
- [ ] No `GET /console/setup` (full setup) outside the Setup wizard
- [ ] GET requests send no `Content-Type: application/json` and cause no CORS preflight
- [ ] Re-opening a page within 30 s uses the cache instead of refetching
- [ ] After a mutation (payment, attendance save) the affected screens refresh without a manual reload

### 11.5 Pagination on long lists

Lists load 20 rows per page from the server (`?page=2`), so they stay fast with thousands of rows. Attendance Reports instead loads more rows as you scroll. For every page below, use a school with **more than 20 rows** (generate a couple of months of invoices, or add staff in bulk).

| Page | Rows paged | What must still be true across all pages |
| --- | --- | --- |
| Students, Admissions | Students / applications | Status chips and totals cover everything, not just the page |
| Fees ▸ Invoices | Invoices | "N invoices · Rs X still due" is the total for the **whole filter**, identical on every page |
| Fees ▸ Payments | Payments | "Received today" is the school's total for today, unchanged by paging or searching |
| Fees ▸ Reports | Payments in the date range | Count and total cover the whole range; table shows 20 at a time |
| Staff | Staff members | The four headline tiles (current staff, salaries, no login, no contract) count **all** current staff, not the page |
| Exams ▸ Analytics ▸ Student performance | Students needing attention | Count of students is the full list |

For each paginated page:

- [ ] Footer reads "Showing 1–20 of N …  Page 1 of M"; it is hidden when everything fits on one page
- [ ] **Previous** is disabled on page 1 and **Next** on the last page; last page shows the remainder (e.g. 41–45 of 45)
- [ ] The page number is in the URL (`?page=2`); reload or share the link and the same page opens
- [ ] Changing any filter, search or status returns to page 1 (no empty "page 3" of a 5-row result)
- [ ] Typing a search does not fire a request per keystroke (one request after a short pause)
- [ ] Going to the next page keeps the old rows visible with "Updating…" instead of flashing a skeleton
- [ ] Open `?page=99` by hand: you land on the last page with data, not an empty table
- [ ] After recording a payment or deleting a row that empties the last page, the list moves back a page instead of showing nothing
- [ ] Row order is stable: the same invoice never appears on two pages or disappears between them
- [ ] Network tab: one list request per page turn, response contains ≤ 20 rows (`pageSize`), plus `total`

Edge cases worth a minute:

- [ ] Exactly 20 rows → no pagination bar; 21 rows → two pages
- [ ] Zero results with a filter → "No … match these filters", no pagination bar
- [ ] Fee report with only a "To" date includes payments taken **on** that day (evening payments too)
- [ ] Timetable lesson form still lists every teacher (it uses a separate unpaged roster, not the paged staff list)

---

## 12. Bug report template

```
Module / page:
Role + campus + year:
Steps:
Expected:
Actual:
Console / network error (status + URL):
Screenshot:
```
