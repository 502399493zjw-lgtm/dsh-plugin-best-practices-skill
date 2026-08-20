# GIF Review

- Run ID: `<run-id>`
- GIF: `<path-or-url>`
- Source commit: `<sha-or-dirty-tree>`
- Purpose: `validation | showcase | both`
- Execution: `real | mock | hybrid`
- Reviewer: `<independent reviewer>`
- Reviewed at: `<ISO-8601>`
- Overall: `PASS | FAIL | NOT_PROVEN`

## Acceptance cases

| Case | Expected visible evidence | Result | Timestamp/frame | Observed fact |
|---|---|---|---|---|
| `<case-id>` | `<criterion>` | `PASS / FAIL / NOT_PROVEN` | `<time>` | `<what is actually visible>` |

## Provenance checks

- [ ] Final encoded GIF was reviewed, not only source frames.
- [ ] GIF claim matches `provenance.json` real/mock/hybrid scope.
- [ ] Source commit/tree and runtime are identified.
- [ ] No token, credential, account path, private content, or machine path is visible.
- [ ] Text, pointer target, state transition, crop, and timing are readable.
- [ ] Automatic assertions support state that a GIF alone cannot prove.

## Gaps and contradictions

- `<missing evidence, mismatch, or none>`

## Decision

`<Why the evidence passes, fails, or does not prove the stated acceptance claim.>`
