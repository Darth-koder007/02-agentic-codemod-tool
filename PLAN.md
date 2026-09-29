# Project 2 — Agentic Codemod Tool

## Purpose

A general-purpose tool: a plain-English instruction ("convert all class components to hooks in this folder", "replace deprecated Button color prop with tone") becomes an AST-based code transform, applied as a reviewable diff with safety rails. Standalone — doesn't require Project 0, though it can be demoed against it.

## Tech decisions

- **AST engine:** `ts-morph` (TS/TSX) as the primary target; keep the transform interface generic enough that a second language could be added later, but don't build that abstraction until it's needed.
- **LLM's role:** two-tier. Tier 1 is a small library of canned, hand-written transforms for common instructions (matched by intent classification). Tier 2 is LLM-generated transform code for anything uncanned, always sandboxed and type-checked before it's shown. This tiering is the core design decision — it's what separates this from "ask an LLM to rewrite my file" and is worth stating explicitly in the README.
- **LLM provider:** same abstraction as Project 1 (see M2.3) — Ollama by default for local iteration, Anthropic optional for the published baseline.
- **Safety:** never apply directly. Dry-run is the default; `--apply` is explicit and only usable after the target file(s) still type-check and pass existing tests post-transform.

## Milestones

### M2.1 — Instruction parser — done

- [x] Classify a plain-English instruction into transform kind + parameters via deterministic pattern matching (`instruction-parser.ts`) — no LLM involved in classification itself, consistent with Project 1's "don't reach for the LLM when a deterministic solution exists"
- [x] Scope (file/folder/glob) comes from the CLI's `--path` flag, not instruction-text parsing — matches the plan's own CLI signature (`codemod run "<instruction>" --path <glob>`), so the instruction only needs to describe _what_, not _where_
- [x] Routes to one of 5 canned (Tier 1) kinds — `rename-jsx-prop`, `rename-import-path`, `rename-identifier`, `extract-magic-literal`, `convert-class-to-function-component` — or `unknown` (Tier 2) when nothing matches
- **Acceptance:** 12 varied instructions (2 more than the 10 minimum), including two phrasings per canned kind and 2 that correctly route to `unknown`. Two real regex bugs found immediately by actually running the tests against varied phrasing (not just the one phrasing each pattern was written against): word-order variation ("rename prop X to Y" vs "rename the X prop to Y") wasn't handled, and the import-path pattern's identifier character class excluded hyphens, silently truncating `lodash-es` to `lodash`. Both fixed.

### M2.2 — AST transform engine (Tier 1) — done

- [x] 5 canned transforms (`src/transforms/`), each a function over a `ts-morph` `SourceFile`, no string-only manipulation: `rename-identifier` (project-wide symbol rename via ts-morph's built-in `.rename()`), `rename-import-path`, `rename-jsx-prop`, `extract-magic-literal`, `convert-class-to-function-component`
- [x] `convert-class-to-function-component` is **deliberately narrow** — only a class with (at most) a trivial constructor (`super(props)` + one `this.state = {...}`) and a single `render()` method, no other lifecycle/instance methods, single-key `setState` calls only. Anything else bails out with a specific reason rather than guessing (verified with a fixture that has `componentDidMount` and confirms the bail message names it). This is a real, stated scope limit, not a hidden gap — see the README's design-decisions section (M2.9) for why: this is a "canned" transform, and a canned transform that guesses wrong on complex cases is worse than one that honestly declines.
- **Acceptance:** one golden-file fixture per transform (`transforms.test.ts`, 7 tests), asserting exact output text, zero LLM involved. 6/7 tests passed on the first run; the class-conversion test needed two real fixes found by actually running it: `extends Component<Props>` (generic type args) wasn't recognized because the check compared the full heritage-clause text instead of just the base expression, and a `setState({ count: this.state.count + 1 })` call wasn't rewritten because the replacement used text captured _before_ an earlier substitution pass had already changed the very substring it was trying to match (reordering the two passes fixed it — and the `this.state.X` pass still catches the reference wherever it lands afterward). Also caught and fixed a wrong ts-morph type guard (`isReferenceFindable` doesn't imply `.rename()` exists; `isRenameable` does) via a real `tsc` error, not a guess.

### M2.3 — LLM client abstraction

- [ ] Reuse the same interface shape as Project 1's M1.3: `generate(prompt, schema?) -> result`, with Ollama (local, default) and Anthropic (optional) implementations, provider selected via env var
- [ ] Local dev runs entirely against the Dockerized Ollama instance — no key, no cost, nothing to get stuck on while iterating on Tier 2
- **Acceptance:** the same instruction produces a proposed transform against both providers with only the env var changed.

### M2.4 — LLM-in-the-loop (Tier 2)

- [ ] For an instruction that doesn't match a canned transform, send the instruction + relevant source + surrounding type context to the LLM, get back a proposed transform (as a diff, not free-form code replacing the whole file)
- [ ] Proposed transform is applied to a throwaway copy, type-checked, and existing tests for that file are run against the copy before it's ever shown to the user
- [ ] If type-check or tests fail, retry once with the failure fed back to the LLM, then give up and report "no safe transform found" rather than showing something broken
- **Acceptance:** an instruction with no canned match produces either a type-checking, test-passing diff, or an honest failure message — never a diff presented as safe that actually breaks the build.

### M2.5 — Diff/review UX

- [ ] `codemod run "<instruction>" --path <glob>` prints a unified diff and a plain-English summary of what changed and why, defaults to dry-run
- [ ] `--apply` writes the change only after the user confirms (or non-interactively with `--yes`, for CI use)
- **Acceptance:** running twice without `--apply` never modifies files; the diff shown matches exactly what `--apply` writes.

### M2.6 — Safety rails

- [ ] Post-transform validation pipeline (type-check, run affected tests) is a reusable step, not duplicated between Tier 1 and Tier 2 — Tier 1 transforms go through it too, since canned doesn't mean infallible
- [ ] On any validation failure, automatic revert of the in-progress change, clear error surfaced to the user
- **Acceptance:** deliberately introduce a canned transform bug in a test scenario and confirm the pipeline catches it before `--apply` would write it.

### M2.7 — Golden-file test suite

- [ ] Fixture per canned transform (instruction + input → expected output), exact match
- [ ] Fixture per Tier 2 scenario using a recorded LLM response in CI (no live calls to either provider in CI)
- [ ] At least one adversarial fixture: an instruction that should produce "no safe transform found"
- **Acceptance:** full suite is deterministic in CI, zero live LLM calls, includes the failure-path case.

### M2.8 — Eval harness

- [ ] 20-30 realistic instructions spanning both tiers, pulled from actual refactors you'd plausibly want to run (not the clean golden-file fixtures from M2.7) — include ambiguous phrasing, multi-step instructions, and a handful that should correctly fail-safe
- [ ] Score: success rate (transform applied, type-checks, tests pass) broken down by tier; correct-refusal rate on the intentionally-bad subset; and Tier 2's retry-then-give-up rate from M2.4
- [ ] Run routine iteration against Ollama; record the published baseline against Anthropic, noting the provider/model next to each number
- [ ] Track numbers in a checked-in `evals/results.md`, regenerated by script
- [ ] CI gate: PR fails if success rate or correct-refusal rate drops below baseline (CI runs against Ollama; publishing an updated baseline is a separate manual run against Anthropic)
- **Acceptance:** running the eval script reproduces the checked-in numbers exactly for the provider recorded alongside them; the correct-refusal rate is verified to be non-zero (the adversarial subset actually exists and is scored, not just present).

### M2.9 — README + demo

- [ ] Lead with the Tier 1/Tier 2 design decision and why safety rails apply to both
- [ ] Architecture diagram: instruction → classify → (canned transform | LLM transform) → validate → diff → apply
- [ ] Recorded demo showing both a canned transform and an LLM-generated one, including one deliberately-failing case that gets caught
- [ ] State the M2.8 eval numbers up front, not buried, with the provider they were measured against
- [ ] "Design decisions" section: why dry-run-by-default, why validation applies uniformly, what happens on ambiguous instructions, why the tool works with no API key via Ollama

### M2.10 — Flip repo to public

- [ ] Public, linked from `projects/04-portfolio-site`

## Testing strategy (summary)

The interesting testing problem here isn't "does the transform work" — it's "how do you trust code an LLM wrote enough to apply it automatically." The answer (type-check + existing-test-run in a sandbox before ever showing the diff, M2.6) is the artifact's real thesis. The eval harness (M2.8) is what proves that answer holds up across a realistic spread of instructions, not just the handful of golden fixtures — both should come up in any interview conversation about this project. The provider abstraction (M2.3) means none of this iteration depends on API access.
