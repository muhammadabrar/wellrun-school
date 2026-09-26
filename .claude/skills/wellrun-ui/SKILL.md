---
name: wellrun-ui
description: Wellrun School UI rules for every interface change — reusable components, forms, dashboards, empty/loading/error states, accessibility, animation, navigation, modals, data density, consistency, role-based UX, and frontend performance. Use when building or editing console, Discover, or any School UI.
---

# Wellrun UI

Follow these rules on **every** UI task in Wellrun School (console, Discover, shared components). Also follow `.cursor/skills/wellrun-brand/SKILL.md` for logos and `.cursor/skills/console-performance/SKILL.md` for fetching and lazy routes.

Shared primitives live in `packages/ui`. Console-only pieces that appear twice move there instead of being copied.

## Rules (verbatim)

1. Build reusable components instead of duplicating UI.

Typical components:

Button
Input
Select
Textarea
Checkbox
Radio
Switch
Modal
Drawer
Dropdown
Tooltip
Tabs
Badge
Alert
Card
Table
Pagination
Search
Filter
EmptyState
LoadingState
ErrorState
Breadcrumb
PageHeader
Sidebar
Navbar

If the same UI pattern appears twice, consider creating a reusable component.

Do not create unnecessary abstractions for one-off elements.

2. Forms must be extremely clear.
   
   Every field should have:
   
   Label
   Input
   Helpful description when necessary
   Validation
   Error message where necessary
   
   Do not rely exclusively on placeholders as labels.
   
   Example:
   
   Email Address
   [________________________]
   
   We'll use this email for account notifications.
   
   Invalid email address.
   
   Group related fields.
   
   Avoid unnecessarily long forms.
   
   For complex forms, divide them into logical sections or steps.
3. Dashboards
   
   Do not create dashboards full of meaningless statistics.
   
   Each metric must answer a useful business question.
   
   Example:
   
   Students
   1,284
   +8.4%
   
   Attendance
   92.4%
   +2.1%
   
   Outstanding Fees
   Rs. 1.24M
   -4.8%
   
   Staff
   86
   
   Prioritize actionable information.
   
   A dashboard should help the user understand:
   
   What is happening?
   What requires attention?
   What changed?
   What should I do next?
4. Never leave an empty screen blank.
   
   Bad:
   
   No data
   
   Better:
   
   No students yet
   
   Students added to this campus will appear here.
   
   [Add Student]
   
   Empty states should explain:
   
   What is missing
   Why it matters
   What the user should do next
5. Loading States very important
   
   Never make users wonder whether the application is frozen.
   
   Use:
   
   Skeletons
   Loading indicators
   Disabled states
   Progressive loading
   
   Prefer skeletons for content-heavy pages.
   
   Avoid unnecessary full-page spinners.
6. Error States
   
   Errors must be understandable.
   
   Bad:
   
   Something went wrong.
   
   Better:
   
   Unable to load students
   
   We couldn't retrieve the student list. Please try again.
   
   [Try Again]
   
   Never expose raw technical errors to normal users.
   
   Log technical details separately when appropriate.
7. Accessibility
   
   Follow accessibility best practices.
   
   Always consider:
   
   Semantic HTML
   Keyboard navigation
   Focus states
   Labels
   ARIA where appropriate
   Sufficient contrast
   Screen-reader accessibility
   Proper button semantics
   Form error announcements
   Touch target sizes
   
   Do not use a <div> as a button when a <button> should be used.
8. Animation
   
   Animations must communicate state or improve usability.
   
   Use animation for:
   
   Opening/closing
   Page transitions
   Loading
   Feedback
   Hover/focus
   Reordering
   
   Avoid animation purely for decoration.
   
   Keep animations subtle and fast.
   
   Respect:
   
   prefers-reduced-motion
9. Navigation
   
   Navigation must reflect the user's mental model.
   
   For SaaS applications, organize navigation by user goals rather than database tables.
   
   Bad:
   
   Database
   Users
   Tables
   Transactions
   Reports
   
   Better:
   
   Dashboard
   
   People
     Students
     Staff
     Parents
   
   Academics
     Classes
     Subjects
     Attendance
     Exams
   
   Finance
     Fees
     Payments
     Expenses
   
   Reports
   
   Settings
   
   Navigation should remain predictable across the application.
10. Do not use modals for everything.
    
    Use a modal when the user needs to:
    
    Confirm an action
    Enter a small amount of information
    Focus on a short task
    
    Use a dedicated page when the task is complex.
    
    Use a drawer when contextual editing is more appropriate.
11. Data Density
    
    Business software often needs more information than marketing websites.
    
    Do not over-minimize enterprise/SaaS interfaces.
    
    Users should be able to efficiently scan:
    
    Names
    Status
    Dates
    Amounts
    IDs
    Actions
    Important metrics
    
    The goal is high information density without visual clutter.
12. Design Consistency
    
    Once a pattern has been established, reuse it.
    
    Do not create:
    
    Button A → 8px radius
    Button B → 12px radius
    Button C → pill
    
    unless there is a deliberate design reason.
    
    The same applies to:
    
    Cards
    Inputs
    Tables
    Typography
    Spacing
    Icons
    Colors
    Navigation
    Modals
    
    Consistency is more important than novelty.
13. Role-Based UX
    
    If the application has different roles, do not simply hide everything based on permissions.
    
    Design the experience around the role.
    
    For example:
    
    Super Admin
    → Configuration
    → Users
    → Organization
    → Reports
    
    Teacher
    → Classes
    → Attendance
    → Exams
    → Students
    
    Accountant
    → Fees
    → Payments
    → Expenses
    → Financial Reports
    
    Parent
    → Children
    → Attendance
    → Results
    → Fees
    
    Each role should see the most relevant information first.
14. Performance
    
    Frontend quality includes performance.
    
    Avoid:
    
    Unnecessary dependencies
    Huge JavaScript bundles
    Unoptimized images
    Rendering unnecessary components
    Excessive API requests
    Duplicate requests
    Unnecessary re-renders
    
    Use:
    
    Lazy loading
    Code splitting
    Image optimization
    Pagination
    Debouncing
    Caching
    Virtualization when appropriate
    
    Do not optimize prematurely, but do not knowingly introduce obvious performance problems.

## Wellrun implementation

- Radius: `rounded-xl` on controls, `rounded-3xl` on cards/pages. Do not mix pill buttons with 8px buttons.
- Color: ink `#16161d`, indigo `#4642ff`, paper `#f7f7f8`, orange `#f26522`.
- Existing motion (`PageSlide`, `Toast`, `SpinnerCheck`) already respects `prefers-reduced-motion` in `apps/console/src/styles/index.css`. Keep it that way.
- Console data fetching: TanStack Query, lazy routes — see console-performance skill.
- Logo: `BrandLogo` from `@wellrun/ui` only.

## Checklist before finishing a UI change

- [ ] No duplicated control that already exists (or should exist) in `packages/ui`
- [ ] Form fields have visible labels; placeholders are not the only label
- [ ] Empty, loading (skeleton), and error states are specific and actionable
- [ ] Buttons are `<button>`, links are `<a>`/`<Link>`
- [ ] Animation is state/feedback only; reduced motion still works
- [ ] Navigation matches the user’s job, not the database
- [ ] Same radius, type, and color as existing screens
- [ ] No extra bundle or duplicate API
