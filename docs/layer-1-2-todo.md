# Wellrun School — Layer 1 + Layer 2 todo

Layer 3 (AI School OS) and the content series stay parked until Layers 1 and 2 can run a school without AI.

Story IDs and phases: [story-index.md](./story-index.md). P0–P2 is the execute spine (31 stories). P3+ is later L1/L2 only.

Execute Layer 1 and Layer 2 in parallel. One NestJS + Postgres backend. Discover stays mobile-first; Console stays desktop-first. English first; Urdu/RTL is Phase F.

## Already shipped

- [x] Monorepo: API, Discover, Console, shared types, i18n keys, tokens
- [x] Multi-tenant School + JWT school-admin login
- [x] Discover search/browse by city
- [x] Public profile: logo, cover, about, location, principal, year, counts, facilities, labs, sports, programs, fees, photos, reviews, posts
- [x] Compare two schools
- [x] Discover SEO: title/OG, sitemap, robots
- [x] Console dashboard: absences, collected, outstanding
- [x] Students list + read-only profile
- [x] Take/save daily attendance
- [x] Record fee payment + on-screen receipt
- [x] Seed 3 Pakistani schools

## Phase A — Operable school

### Shared / API

- [ ] Media upload (logo, cover, photos, videos)
- [ ] School profile write API + publish/unpublish
- [ ] Academic year + class + section CRUD
- [ ] Student create / edit / withdraw + guardian attach
- [ ] Staff/teacher create / edit
- [ ] Fee plan CRUD + generate invoices for a class/month
- [ ] Role guard: school_admin vs teacher

### Layer 1 — Discover

- [ ] Activities and events on the profile
- [ ] Videos on the profile
- [ ] Public-safe alumni / notable students block
- [ ] Sticky compare bar on home

### Layer 2 — Console

- [ ] School settings that publish to Discover
- [ ] Students create / edit / withdraw
- [ ] Classes and academic year screens
- [ ] Teachers/staff directory
- [ ] Fee plans + generate monthly invoices
- [ ] Print-friendly receipt

## Phase B — Discovery network

- [ ] Filters: city, fee range, program, facilities
- [ ] Sort: fee, rating, established, size
- [ ] City landing pages (`/karachi`, `/lahore`, `/islamabad`)
- [ ] Map pin from lat-long
- [ ] Photo lightbox + video player
- [ ] Events list (date, title, cover)
- [ ] Posts as a real feed
- [ ] Submit + moderate reviews
- [ ] Compare: third school, shareable URL, highlight diffs
- [ ] Shortlist / save schools
- [ ] Claim school from console
- [ ] Profile completeness meter
- [ ] Per-school Open Graph image
- [ ] Parent-facing empty/error states

## Phase C — SMS core

- [ ] Guardian records (phone, optional CNIC, multiple children)
- [ ] Parent login (attendance, fees, notices)
- [ ] In-app / stub SMS to a parent or class
- [ ] Assign teacher to class/subject
- [ ] Teacher login: attendance + roster
- [ ] Late + excused in attendance UI
- [ ] Month attendance register
- [ ] Printable today’s absent list
- [ ] Attendance history on student
- [ ] Admissions pipeline + convert to enrolled student
- [ ] Admission fee invoice on enroll
- [ ] Fee discounts / sibling concession
- [ ] Outstanding fees report
- [ ] Due-date reminder queue (not WhatsApp)
- [ ] Reprint receipts; fee ledger on student

## Phase D — Academics

- [ ] Subjects per class
- [ ] Exam sessions + date sheet
- [ ] Marks entry
- [ ] Result card + publish to parents
- [ ] Timetable with teacher clash checks
- [ ] Teacher and class timetable views

## Phase E — School operations

- [ ] Staff contracts + leave
- [ ] Monthly payroll + payslip
- [ ] Inventory stock in/out + low stock
- [ ] School-wide and class notices
- [ ] Daily absent, unpaid fees, monthly school reports + CSV/print
- [ ] WhatsApp stays out until Layer 3

## Phase F — Harden and ship

- [ ] Password reset + invites
- [ ] Audit log
- [ ] PDF receipts and result cards
- [ ] Platform admin (list / unpublish schools)
- [ ] Discover desktop V2
- [ ] Pagination + image CDN
- [ ] Tests for auth, attendance, payments, admissions
- [ ] Deploy API, Postgres, both apps
- [ ] Urdu / RTL

## Parked — Layer 3

- [ ] AI chat / “add Rs 15,000 for student 10234”
- [ ] WhatsApp as operator
- [ ] Content series filming
