# `server/utils/` Organization — Problem & Best Practices

> Status: advisory / planning doc. No code has been changed. This captures the problem,
> the relevant best practices, and a concrete (optional) plan for when we decide to act.

---

## The problem (as it actually is)

The instinct is "my `utils/` folder is getting big and some files are huge — should I add subfolders?"

But "too many files" and "some files are too long" are **two different problems**, and **subfolders solve neither well**. The real issues are:

1. **`utils/` is doing double duty.** It holds both genuinely generic infrastructure *and* domain logic (property / company / MSA / SFR-pipeline code) that only got parked there because it's a "helper." Mixing those is what makes the folder feel like a junk drawer — not the file count.
2. **A couple of files are long for different reasons.** One is long because it's a big static data table (fine). One is long because it bundles several unrelated responsibilities (worth splitting).

File count alone (~16 files) is **not** the problem. Flat folders stay navigable well past this — fuzzy file-open and search don't care about nesting depth.

---

## Best practice: organize by *what code is about*, not by *"it's a helper"*

"Utils" is not an organizing principle — almost everything is arguably a helper. The useful question to ask each file is:

> **Is this generic infrastructure, or is it about a domain concept?**

- **Generic** (domain-agnostic, reusable across any feature) → belongs in a flat `utils/`.
- **Domain** (knows about properties, companies, MSAs, the SFR pipeline, etc.) → belongs **next to that domain** (colocation), not in `utils/`.

This is the mature, industry-standard pattern: **colocation**. Helpers live near the feature that owns them; only truly cross-cutting code goes in shared `utils/` / `lib/`. A large `utils/` folder is usually a sign that domain logic is being dumped there.

### `utils/` vs `lib/`

This repo already has the right split — keep leaning into it:

- **`lib/`** = stateful wrappers / integrations with external systems (e.g. `supabase.ts`, the `ServiceError` base in `error.ts`).
- **`utils/`** = pure, stateless, generic functions.

---

## Applying it to our current `server/utils/`

### Genuinely generic — these *should* stay in a flat `utils/`

| File | Why it's generic |
|---|---|
| `delay.ts` | timing primitive |
| `uuid.ts` | id validation |
| `clampLimit.ts` | pagination math |
| `dbErrors.ts` | Postgres error classification |
| `validate.ts` | Zod-to-`ServiceError` adapter |
| `fetchWithRetry.ts` | HTTP retry wrapper |
| `sanitizeHtml.ts` | HTML sanitization |
| `generateTempPassword.ts` | crypto helper |
| `asyncHandler.ts` | Express wrapper |

### Actually domain logic wearing a "utils" costume — candidates to relocate near their domain

| File | What it's really about | Better home (suggestion) |
|---|---|---|
| `propertyDataHelpers.ts` | SFR → DB property transforms/inserts | near the properties services or `server/jobs/data_v2/` |
| `dataSyncHelpers.ts` | company/county sync, flipping-company detection | SFR pipeline area |
| `orderTransactions.ts` | transaction ordering + spread calc | properties domain |
| `resolveMsa.ts` | MSA resolution | properties/MSA domain |
| `resolveCounty.ts` | ZIP → county lookup | properties/MSA domain |
| `fetchCounty.ts` | Census reverse-geocode | geocoding domain |
| `normalization.ts` | address/company/date normalization | borderline — see note below |

> `normalization.ts` is a judgment call: the address/company normalizers are domain-flavored,
> but the date helpers (`normalizeDateToYMD`, `addDaysToYMD`) are generic. It's fine to leave
> as-is, or split the generic date helpers out into a `utils/date.ts`.

**Relocating the domain helpers is the highest-leverage move.** It shrinks `utils/` to ~9 genuinely-generic files, at which point "is it too big?" answers itself — and we never had to introduce a single subfolder.

---

## Long files: split by **cohesion**, not by line count

Length alone is not a defect. Judge by whether a file does *one cohesive thing*.

| File | Lines (approx) | Verdict |
|---|---|---|
| `resolveCounty.ts` | ~1,870 | **Leave it.** ~1,800 lines is a static ZIP→county **data map**, not logic. Splitting a lookup table makes it worse. Optional: move the data into a `.json` / `constants/` data file so the file is "lookup function + imported data." |
| `propertyDataHelpers.ts` | ~850 | **Split candidate.** Bundles distinct responsibilities — `transformX` functions, `insertX` functions, and batch collectors. Splits cleanly along those seams (transforms / inserts / collectors). This is decomposition by *responsibility*, the right reason to split. |
| `normalization.ts` | ~290 | **Fine.** Cohesive family of normalizers — this is what a well-sized module looks like. |

**Anti-pattern to avoid:** splitting a file just because it crossed an arbitrary line count. That produces several files you must open together to follow one flow — worse than one cohesive long file.

---

## When *are* subfolders the right call?

Subfolders in `utils/` are reasonable **once a cluster of 3–4 genuinely-generic, cohesive helpers emerges** (e.g. several date utilities → `utils/date/`, several HTTP helpers → `utils/http/`).

- **Rule of thumb:** don't create a folder for fewer than ~3–4 cohesive files.
- Introduce structure when a cluster *emerges*, not preemptively.
- Avoid a `utils/index.ts` barrel file — barrels invite circular-dependency and tree-shaking headaches. This repo's per-domain `index.ts` files in `services/` and `controllers/` are fine; `utils/` doesn't need one.

---

## Recommended plan (optional, in priority order)

1. **Don't add subfolders yet.** Flat is clearer at this size.
2. **Relocate the domain helpers** out of `utils/` toward the features that own them (the property/SFR-pipeline files above). This is the move that actually shrinks the folder and improves the mental model.
3. **Split `propertyDataHelpers.ts`** by responsibility (transforms / inserts / collectors).
4. **Leave `resolveCounty.ts` as-is** (or just move its data table into a data file).
5. **Revisit subfolders only if** a cluster of 3–4 genuinely-generic helpers later emerges.

> Net takeaway: the structure that pays off here is **moving domain code home**, not nesting
> `utils/` into subfolders. The folder feels big because it's mixing concerns, not because it
> has too many files.
