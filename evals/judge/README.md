# Judge prompt eval

Measures how well a judge prompt turns a repo's description into a verdict, so prompt changes are
decided by numbers instead of by reading a few outputs.

```
python evals/judge/run_eval.py --prompt prod --runs 5   # what src/judge.py ships
python evals/judge/run_eval.py --prompt v5 --runs 5     # a new candidate
```

Calls run in parallel (`--workers`) and every output is cached by model + prompt hash in
`results/cache/`, so a re-run after 503s only repeats the failed calls, and an unchanged prompt costs nothing.

Each run prints a summary and the failing cases, and writes `results/<prompt>.json` (gitignored).
Cost per prompt: `runs × ceil(24 / batch)` judge calls + the same number of grader calls (24 with the defaults).
If the output says `only N% of judgments came back`, the scores are partial (API errors). Don't compare them.

## Files

| File | What it is |
|---|---|
| `dataset.json` | 24 synthetic cases, each with an `expected` verdict, an `acceptable` set, and a `why` tied to `profile.md`. |
| `prompts.py` | Prompt versions. `prod` is imported from `src/judge.py`; `v1` is a frozen copy of the original. |
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

## Results (2026-10-13, gemini-3.5-flash-lite judge and grader, 24 cases × 5 runs, temperature 0.2)

| Metric | v1 (original) | v2 | v3 | v4 (shipped) | v4 @ temp 0 |
|---|---|---|---|---|---|
| answered | 100% | 100% | 100% | 100% | 100% |
| acceptable verdict | 100% | 98.3% | 94.4%¹ | 99.2% | 97.5% |
| exact verdict | 90.8% | 91.7% | 88.9%¹ | 91.7% | 92.5% |
| same verdict every run | 91.7% | 83.3% | 75.0%¹ | 79.2% | 79.2% |
| grounded (no invented facts) | 67.5% | 92.5% | 90.3%¹ | 89.5% | not graded |
| name/pronoun leaks | 0% | 0% | 0% | 0% | 0% |

¹ 3 runs.

What each version taught:
- **v1**: on empty descriptions it wrote "lacks documentation", "incomplete", and rejected the repo on
  evidence it never saw. It also restated the profile's exclusion wording as facts ("zero architectural innovation").
- **v2** (XML tags, verdict definitions, untrusted data, no-invention rule): grounding 67.5% → 92.5%, but it
  called a keyword-stuffed meme-coin bot "fit" in 2 of 5 runs.
- **v3** (v2 + five changes at once): worse than v2 on every metric. Its strict boundary ("squarely" vs "supports")
  pushed clear fits to "maybe". Bundling changes made it impossible to tell which one hurt.
- **v4** (v2 + one rule: judge function, not buzzwords): the meme-coin bot is "not-fit" in 5/5 runs.
- **Temperature 0** did not change consistency (79.2% both). Each run puts a repo in a different batch, so
  the remaining flips most likely come from batch neighbours, not sampling. 4 of v4's 5 flipping cases move
  between verdicts the dataset accepts.

Open question: judging one repo per call would remove batch effects, at the cost of more requests per day
(the free tier allows 20/day on most flash models). Test with `--batch 1` before changing the pipeline.

## Workflow

1. Run `prod` and read the failures, not just the averages.
2. Write `v5` in `prompts.py` aimed at one failure type. Change one thing per version.
3. Run it with `--runs 5`. Keep it only if the target metric improves and nothing else regresses.
4. When a version wins, copy it into `judge.build_judge_prompt` and confirm `prod` now matches it.
5. When production gets a verdict wrong, add that repo as a new case so the eval keeps catching it.

## Limits

- The labels are proposals derived from `profile.md`. Review them: the eval measures agreement with these
  labels, not with your actual taste.
- The grounding grader is an LLM and can be wrong. Spot-check its `unsupported_claims` in the results file.
  Hand-checking v1's flags found false positives (paraphrases of the description), so the grader prompt was
  narrowed with examples. `--grader-model` is a fallback chain, so a few batches may be graded by another model.
- 24 cases × 5 runs is small. A 1–2 case difference between prompts is noise. Look for consistent gaps.
