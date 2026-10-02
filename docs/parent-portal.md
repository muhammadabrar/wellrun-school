# Parent portal

A separate app (`apps/parent`) for parents and guardians. It talks to the same API under `/parent/*`, so a mobile app can reuse it later.

## How a parent signs in

1. They type their mobile number.
2. If that number belongs to a guardian at any school, a 6-digit code is texted to it. The screen looks the same for unknown numbers, so it can't be used to find out which numbers a school holds.
3. They type the code. This phone is now remembered; no code is needed again on it. A new phone asks for a code again.

One verified number shows every child linked to a guardian with that number, across schools. Each child shows the school they attend.

Guardian **phone** and **CNIC** are unique within a school (the same person may be a guardian at several schools). The CNIC is stored but is not used to sign in.

## Run it locally

```
pnpm dev:api        # http://localhost:3000
pnpm dev:parent     # http://localhost:5174
```

No SMS provider is wired up yet. In development the code is printed in the API log. To skip reading the log, set a fixed code (ignored when `NODE_ENV=production`):

```
PARENT_DEV_OTP=123456
```

Then sign in with the phone number of any guardian (Students → a student → Family shows it). In production `ConsoleSmsSender` refuses to send, so a real provider must replace it before launch: implement `SmsSender` in `apps/api/src/parent/sms.ts` and bind it to `SMS_SENDER` in `parent.module.ts`.

### Settings

| Where | Name | What it does |
| --- | --- | --- |
| API | `CORS_ORIGINS` | Add the parent app's origin (for example `http://localhost:5174`) when this is set |
| API | `OTP_SECRET` | Key for hashing codes. Falls back to `JWT_SECRET`. Set one in production |
| API | `PARENT_DEV_OTP` | Fixed 6-digit code for local testing only |
| Parent app | `VITE_API_URL` | API address. Defaults to `http://localhost:3000` |

## Limits that protect parents and the school

- A code works for 5 minutes and is locked after 5 wrong tries.
- One code per minute, five per hour, per number.
- Revoking a phone ("Phones signed in" under More) takes effect on its next request.
- Parents see only their own children, only published results, and only their own fee bills and receipts.

## The app

Built to be usable by a young child or someone who only knows WhatsApp: one question per screen, big tap targets, a picture and one word per button, no tables. Green means present or paid, red means absent or owing.

- English by default; the **اردو** button is on every screen. The choice is saved on the phone and on the account.
- Urdu switches the whole app to right-to-left and uses a Nastaliq font. Phone numbers and money stay left-to-right. Text written by teachers follows its own direction.
- It can be installed to the home screen (PWA).

## Manual test

| # | Scenario | Expected |
| --- | --- | --- |
| P1 | Sign in with a number no guardian has | Same "code sent" screen. No code arrives; entering one says it has expired |
| P2 | Sign in with a guardian's number and the right code | Lands on the child (or the list if more than one) |
| P3 | Wrong code five times | Locked; ask for a new code |
| P4 | Ask for a code twice within a minute | Second request says to wait, with a countdown |
| P5 | Sign in from a second browser | Asks for a code there; the first browser stays signed in |
| P6 | More → sign out the other phone | That phone is sent back to sign-in on its next action |
| P7 | A guardian with children in two schools | List shows both, each with its school name |
| P8 | Open a child | Today's attendance, fees and next exam show as plain cards; six big buttons below |
| P9 | Attendance | Month calendar coloured by status, percent, counts; previous and next month work, no future months |
| P10 | Homework | Today's entries by subject, due dates in orange, photo opens full size; previous and next day work |
| P11 | Fees | Total to pay, each bill with its status; "Open fee slip" and "Open receipt" open PDFs |
| P12 | Results | Only published results; subjects expand; "Open report card" opens the PDF |
| P13 | Notices | School-wide and this child's class notices only; pinned first |
| P14 | Timetable | Today's day selected; breaks shown; days without lessons say so |
| P15 | Switch to اردو | Every screen turns right to left, text is Urdu, arrows flip, numbers and money are still readable |
| P16 | Reload after choosing Urdu; sign in on another phone | Stays Urdu; the other phone starts in Urdu too |
| P17 | Call another family's child through the API | 403 "This child isn't linked to your phone number" |
| P18 | Student page → Family (in the console) | Each guardian shows whether they have signed in and when they were last seen |
| P19 | Phone at 360 px width | No sideways scrolling; every button at least 56 px tall |
| P20 | Offline | A plain "no internet" message with Try again, never a blank screen |
