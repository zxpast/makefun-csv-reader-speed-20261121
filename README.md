# Read broken CSV files faster

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/zxpast/makefun-csv-reader-speed-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/zxpast/makefun-csv-reader-speed-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A make.fun entry for
[`csv-reader-speed-01-run-20261121`](https://make.fun/bounty/csv-reader-speed-01-run-20261121):
a faster drop-in for make.fun's own csv-reader 1.0.0. `solve.js` answers
every case's `{text, header}` input with exactly csv-reader's `{columns,
rows, errors}`, and `main.ts` reads every case from `/input/cases.json` and
writes the answers to `/output/answers.json`.

## How it is fast

csv-reader reads one character at a time and builds each field up a
character at a time. This reader makes one pass over the text and cuts each
field out with `indexOf`/`slice` instead: an unquoted field ends at the first
comma or line break found by two C scans, a quoted field is found by
`indexOf` on its closing quote (doubled quotes skipped), and only the rare
broken bits — a stray CR, a doubled quote, a line break inside quotes, junk
after a closing quote — take a slower path. No regular expression runs on
the hot path, no object is allocated per field, and the only per-field
allocations are the field strings themselves, which the answer needs anyway.

On the kit's practice set (6 cases, ~10.6 MB of CSV) it parses in ~0.2 s of
CPU against csv-reader 1.0.0's ~0.8 s — about 4x faster — while returning
byte-identical answers on all 6 cases.

## Run

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<cases dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

The program uses only the Node standard library, makes no network calls,
and is deterministic: two runs write identical bytes.

## Prizes

$100 in total: 1st–10th place $10 each, for entries that beat the house
baseline (csv-reader 1.0.0) at 95% confidence.
