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

### M2.7 — Golden-file test suite — done (already satisfied by M2.1-M2.6)

- [x] One fixture per canned transform, exact-match output (`transforms.test.ts`)
- [x] Tier 2 scenarios use a hand-written deterministic fake `LlmClient` (`tier2.test.ts`, `run-codemod.test.ts`) — same reasoning as Project 1's M1.7: simpler than a record/replay mechanism, zero flakiness risk, exercises the identical `LlmClient` interface the real clients implement
- [x] Adversarial fixture present: `tier2.test.ts`'s "gives up honestly after two failed attempts" case
- **Acceptance:** verified directly, same method as Project 1 — stopped the Ollama container entirely and re-ran the full suite; all 33 tests still pass. CI never needs Ollama or an Anthropic key to pass.

### M2.8 — Eval harness — done

- [x] 24 instructions spanning both tiers (12 Tier 1, 12 Tier 2), including ambiguous phrasing and 8 adversarial cases designed to correctly fail (nonexistent target, unresolvable import, undeclared reference, uninstalled package, missing type)
- [x] Score: success rate broken down by tier; correct-refusal rate on the adversarial subset; Tier 2's retry-then-give-up rate
- [x] Run routine iteration against Ollama (`llama3.2:3b`); no Anthropic baseline recorded yet — same optional/deferred status as Project 1
- [x] Track numbers in a checked-in `evals/results.md` + `evals/baseline.json`, regenerated by `pnpm eval`
- [x] CI gate (`pnpm eval:check`) with a 10% regression-tolerance band, same rationale as Project 1's M1.8
- **Acceptance — with two real bugs found and fixed by the live run, and one important honest limitation documented:**
  - Live run 1 (before fixes) surfaced two real bugs, not model noise: (1) `instruction-parser.ts`'s shared `QUOTED` regex excluded `/`, so the import-rename matcher never matched any real file path — both `t1-03` and `t1-04` silently fell through to Tier 2 instead of routing to the canned Tier 1 transform. Fixed by adding `/` to the character class; verified against both cases directly with a standalone regex test before re-running. (2) `convertClassToFunctionComponent` dropped the props type entirely (`function Counter(props) {`, no annotation), failing `noImplicitAny` under `strict` — the class's own `extends Component<CounterProps>` heritage clause has the type right there. Fixed by reading `getExtends()?.getTypeArguments()` and annotating the parameter. Also added `react`/`@types/react` as devDependencies — JSX eval targets couldn't type-check at all without them (`jsx: "react-jsx"` needs `react/jsx-runtime`'s types), which was masking both the above as a wall of unrelated-looking "Cannot find module 'react'" errors.
  - After both fixes: Tier 1 is **100%** across 5 consecutive live runs (as a fully deterministic tier should be — any run-to-run variance there would itself be a bug).
  - Tier 2 is genuinely noisy run-to-run, confirmed by running the full eval 5 times: success rate **75–100%** (mean ~90%), correct-refusal rate on the adversarial subset **67–100%** (mean ~87%), retry rate 17–42%. Root cause isolated with a standalone repro on `t2-10` (same instruction, same target, two different runs — one correctly refused, one didn't). This is `llama3.2:3b` sampling variance, not a code bug: on some runs the model recognizes an instruction references something that doesn't exist (a fake npm package, an undeclared variable) and correctly reports it can't do the task; on other runs it quietly substitutes a safe workaround that still type-checks and calls that "done." `validateChange`'s type-check-only gate has no way to tell "did what was asked, safely" apart from "ignored the impossible part, did something else safely" — it can only judge the output, not fidelity to the instruction. This is the real, honest limitation of the design and is called out in the README rather than papered over with a stricter heuristic tuned to pass this one eval set.
  - First attempt at a fix: widen `eval:check`'s tolerance. Rejected in favor of the real fix — a single-run baseline can land anywhere in that 25-33 point range, including its ceiling, which then makes every subsequent honest run look like a regression against a number that was never typical. `run-eval.ts` was restructured so **both** `pnpm eval` (writes the baseline) and `pnpm eval:check` (gates CI) run the full 24-case suite 3 times sequentially (not concurrently — concurrent runs would race on the same on-disk target files exactly like the M2.6 bug) and compare/report the mean. This doesn't remove the underlying model noise, but it shrinks the sampling error enough that a fixed tolerance band means something. Verified: the committed baseline (mean of 3 runs: Tier 1 100%, Tier 2 86.1%, correct-refusal 85.2%) is consistent with the 5 individual runs recorded above, and a subsequent `pnpm eval:check` run against it passed cleanly (86.1%/81.5% vs. baseline, well inside the 10% band) — confirming the averaging actually stabilizes the gate rather than just moving the noise around.

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
