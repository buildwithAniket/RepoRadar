# Judge prompt eval

Measures how well a judge prompt turns a repo's description into a verdict, so prompt changes are
decided by numbers instead of by reading a few outputs.

```
python evals/judge/run_eval.py --prompt v1 --runs 3   # production prompt (baseline)
python evals/judge/run_eval.py --prompt v2 --runs 3   # candidate
```

Each run prints a summary and the failing cases, and writes `results/<prompt>.json` (gitignored).
Cost per prompt: `runs × ceil(24 / batch)` judge calls + the same number of grader calls (24 with the defaults).
If the output says `only N% of judgments came back`, the scores are partial (API errors). Don't compare them.

## Files

| File | What it is |
|---|---|
| `dataset.json` | 24 synthetic cases, each with an `expected` verdict, an `acceptable` set, and a `why` tied to `profile.md`. |
| `prompts.py` | Prompt versions. `v1` is imported from `src/judge.py`, so it is always the shipped prompt. |
| `run_eval.py` | Runs a prompt over the dataset and grades it. |

## Metrics

| Metric | Grader | Catches |
|---|---|---|
| `answered_rate` | code | API failures or the model dropping repos |
| `schema_ok` | code | bad or missing `verdict`/`judgment` |
| `identity_leak_rate` | code (regex) | "you", "his", owner name in public reports |
| `concise_ok` | code | judgment over 90 words or multi-paragraph |
| `accuracy_acceptable` / `accuracy_exact` | label | verdict outside the acceptable set / not the expected one |
| `accuracy_by_tag` | label | which kind of case fails (exclusion, adversarial, grounding, …) |
| `consistency_across_runs` | label | same case, different verdicts across runs |
| `grounded_rate` | model | judgments that claim facts the input does not contain |

## Workflow

1. Run `v1` and read the failures, not just the averages.
2. Write `v3` in `prompts.py` aimed at one failure type.
3. Run it. Keep it only if the target metric improves and nothing else regresses.
4. When a version wins, copy it into `judge.build_judge_prompt` (the `v1` entry then follows automatically).
5. When production gets a verdict wrong, add that repo as a new case so the eval keeps catching it.

## Limits

- The labels are proposals derived from `profile.md`. Review them: the eval measures agreement with these
  labels, not with your actual taste.
- The grounding grader is an LLM and can be wrong. Spot-check its `unsupported_claims` in the results file.
  Using the same model as judge and grader can bias it toward its own wording. Set `--grader-model` to a
  different model when quota allows.
- 24 cases × 3 runs is small. A 1–2 case difference between prompts is noise. Look for consistent gaps.
