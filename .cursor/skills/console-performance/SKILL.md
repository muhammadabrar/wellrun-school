---
name: console-performance
description: Enforces Wellrun console performance rules on every code change — lazy route components, React Query instead of useEffect fetching, no duplicate APIs, slim endpoints that return only required data. Use when changing any console page, route, API, Nest controller/service, data fetching, imports, or setup/admission endpoints.
---

# Console performance

Apply these rules on **every** Wellrun console, API, and shared change. Do not ship a page or endpoint that violates them.

## Rules (verbatim)

1. Must Dont load all imported components load only nessory components,
2. right now when i try to load dashboard or any page all the components get load even some component are not required in that particular page
3. Too many unncessory and duplicate API calls, when i opening the Admission setting, 1 API called 5 times and 4 time failed 5 time preflight and one time successfull, (This issue exist in all Pages)
4. Make sure we must use react query or SWR for API request instead of useEffect
5. One another and major issue, For just Admission form i am getting whole setup data which i think uncessory API must return only required data



## How to implement them



### 1–2. Load only the page that is open

- Route pages in `apps/console/src/App.tsx` must be `React.lazy` + `Suspense`. Never statically import dashboard, admission, students, or other route pages into `App.tsx`.
- Keep `Shell` and `Login` eager. Everything else is a lazy chunk.
- Do not import a page-only component (editors, heavy helpers, `xlsx`) from a shared layout. Import it from the page that needs it.
- Heavy libraries (`xlsx`, charts) must be `import()` at the call site, never a top-level import in a shared module.

```tsx
const AdmissionSettingsPage = lazy(() =>
  import("./pages/AdmissionSettings").then((m) => ({ default: m.AdmissionSettingsPage })),
);
```



### 3. One in-flight request per resource

- All server reads go through TanStack Query (`useQuery` / `useMutation`) with shared `queryKeys` from `apps/console/src/lib/query.ts`.
- `staleTime` at least 30s. `refetchOnWindowFocus: false`. Retry only 5xx, max 1 extra attempt.
- Never refetch on `location.pathname`. Shell setup-complete check uses `GET /console/setup/status` once, not full setup, not on every navigation.
- Mutations `invalidateQueries` the keys they change. Do not fire a second identical GET from the page and from Shell.
- `request()` in `apps/console/src/lib/api.ts` must set `Content-Type: application/json` only when there is a body. GET must not send JSON content-type (that forces extra CORS preflights).



### 4. React Query, not useEffect, for API

- Forbidden: `useEffect(() => { api.foo().then(setData) }, ...)`.
- Allowed: `useQuery({ queryKey, queryFn })`, `useMutation`, and `useEffect` for local UI (focus, timers, copying query data into a draft form).
- Auth actions (login, register) may stay as event-handler `api.*` calls.



### 5. Slim endpoints — return only what the page needs


| Page               | Endpoint                            | Payload                                        |
| ------------------ | ----------------------------------- | ---------------------------------------------- |
| Shell gate         | `GET /console/setup/status`         | `{ setupCompleted, setupStep }`                |
| Admission settings | `GET /console/setup/admission-form` | `{ fields }`                                   |
| Admit student      | `GET /console/setup/admission`      | `{ fields, classes: { id, name, section }[] }` |
| Campuses           | `GET /console/setup/campuses`       | `{ campuses }`                                 |
| Classes & subjects | `GET /console/setup/academics`      | `{ years, classes, subjects }`                 |
| Fee structure      | `GET /console/setup/fees`           | `{ feeItems, templates.feeItems }`             |
| Public profile     | `GET /console/setup/profile`        | `{ school }` (profile fields only)             |
| Setup wizard       | `GET /console/setup`                | full overview — **wizard only**                |


Never call `GET /console/setup` from Admission, Admission settings, Dashboard, Shell, Campuses, Academics, Fees structure, or Profile.

Do not add `include` blobs (memberships, templates, all campuses, fee items, subjects) to an endpoint that does not render them.

## Checklist before finishing a change

- [ ] New route is lazy in `App.tsx`
- [ ] New fetch uses `useQuery` / `useMutation` and a `queryKeys.*` entry
- [ ] No `useEffect` + `api.*`
- [ ] No `api.setup()` except Setup wizard
- [ ] New GET returns only fields the UI reads
- [ ] GET requests do not set JSON `Content-Type`
- [ ] Opening the page in the network tab: one GET for that resource, not five, not a full setup dump