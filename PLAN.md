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

### M2.3 — LLM client abstraction — done

- [x] Same interface shape as Project 1's M1.3 (`LlmClient.generate({prompt, system}) -> GenerateResult`), Ollama default + Anthropic optional, provider/model selected via `LLM_PROVIDER`/`LLM_MODEL` env vars — a fresh copy in this repo, not a cross-repo import, since this project is standalone (see the plan's own "doesn't require Project 0")
- [x] Local dev runs against a Dockerized Ollama instance on host port **11436** — distinct from Project 1's 11435 and the OS default 11434, so both portfolio projects' containers (and any native install) can run side by side without colliding
- **Acceptance:** verified live, not just structurally — `docker compose up -d`, pulled `llama3.2:3b` (same model choice as Project 1, same reasoning: 1b hallucinated there in manual testing), called `createLlmClient().generate(...)` with zero env config and got a real completion back from the container.

### M2.4 — LLM-in-the-loop (Tier 2) — done

- [x] **Deliberate deviation from the plan's literal wording, disclosed rather than silent:** the LLM returns full proposed file content (instructed to change only what the instruction requires, byte-identical otherwise), and _this tool_ computes the diff via the `diff` package — not the LLM hand-authoring unified-diff syntax directly. Small local models are unreliable at correct diff hunk headers/line counts; the user-facing artifact is still always a diff (never a raw file dump), which is what the safety property in the plan's wording is actually protecting against.
- [x] Every attempt is sandboxed by `validate-change.ts`: the real file is temporarily overwritten on disk (so its actual imports/types resolve against the real project), type-checked via the nearest `tsconfig.json`, optionally test-run via a caller-supplied shell command, then the original content is restored in a `finally` block **unconditionally** — verified with a dedicated test that a syntactically-broken proposal still leaves the file byte-identical afterward
- [x] Retry-once-then-give-up (`tier2.ts`): on failure, the model's next prompt includes the specific validation failure and is asked to fix it; a second failure returns an honest `no-safe-transform` result with the reason, never a diff
- [x] "Existing tests run against the copy" is **scoped, not a universal auto-detector**: `validateChange` accepts an optional `testCommand` (a real shell command the caller supplies); type-checking alone gates the result when omitted. Auto-discovering and safely running an arbitrary project's test setup for one temporarily-swapped file is a much larger problem than this milestone's scope — stated here rather than silently narrowed.
- **Acceptance:** verified live against real Ollama with genuinely unscripted instructions (not fixtures written to match a known-good answer) — "add JSDoc comments explaining this function" succeeded on the first attempt with correct, real JSDoc; a deliberately-impossible instruction ("call a function that doesn't exist, no import") correctly exhausted both retries and returned `no-safe-transform` with the real type error named. The target fixture file was confirmed byte-identical on disk after both runs. 7 tests (`validate-change.test.ts`, `tier2.test.ts`) cover the same paths deterministically with a fake `LlmClient`.

### M2.5 — Diff/review UX — done

- [x] `codemod run "<instruction>" --path <path>` (file or directory — see the scope note below) prints a unified diff plus status/reason per file, defaults to dry-run
- [x] `--apply` requires `--yes` to actually write; without it, prints how many files _would_ change and explains how to proceed, writing nothing
- [x] **Scope note, stated plainly:** `--path` accepts a literal file or directory (recursively, skipping `node_modules`/`dist`), not full glob syntax (`src/**/*.tsx`). A real glob implementation is a small, bounded addition if this tool grows beyond portfolio scope — not worth a dependency for what's demonstrated here.
- **Acceptance:** verified against a real scratch file outside this repo (`/tmp/codemod-scratch`), not just fixtures — confirmed a dry-run leaves the file byte-identical, `--apply` without `--yes` also leaves it untouched (prints the "would change" notice instead), and `--apply --yes` writes exactly the diff that was shown beforehand.

### M2.6 — Safety rails — done

- [x] One shared validation pipeline (`validate-change.ts`'s `validateChange`, reused by both tiers via `run-codemod.ts`) — Tier 1 transforms go through the exact same type-check gate as Tier 2, not a shortcut
- [x] Any validation failure reverts automatically — `validateChange` writes the proposal, checks it, and restores the original in a `finally` block unconditionally, regardless of outcome
- **Acceptance, and a real incident this milestone's own tests surfaced:** two _different_ test files (`validate-change.test.ts` and an earlier version of `run-codemod.test.ts`) independently targeted the same fixture file. Vitest runs different test files concurrently by default, so their write-then-restore cycles raced each other — one test's "original" snapshot was actually mid-flight content from the other, and the fixture ended up permanently stuck in a broken state on disk, discovered only because a later `tsc`/`eslint` run failed on it. This is a direct, literal demonstration of exactly the failure mode M2.6 exists to prevent — just happening to this project's own tests rather than a codemod's target file. Fixed by giving every test that exercises the sandbox its own dedicated fixture (now three near-identical `tier2-target*.ts` files, deliberately not deduplicated — shared mutable state across concurrent tests was the actual bug), then verified by running the full suite three times in a row and confirming all three fixtures stayed byte-identical after every run.

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
