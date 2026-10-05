// The corpus conformance level for cifra.md in JavaScript (cifra_js.package
// refinement; DIRECTION §3.6 lines 280–287; corpus/README.md lines 37–58 for
// reading, 126–149 for merge). Every reading entry's checks 1–4 and 6 and
// every merge entry's forward check are run and asserted against the ledger:
// a check named in expected-failures.json must fail, a check not named must
// pass. Nothing is skipped, so a premature pass or a regression both fail the
// gate. At this landing the package is stubbed, so every check is a named
// expected failure and the suite is green.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";

import * as impl from "../src/index.js";
import { discover, readingChecks, mergeChecks, staleLedgerIds } from "./corpus/harness.js";

// The corpus is a sibling of js/, found by relative path so the harness needs
// no configuration and works from whatever checkout the gate points at
// (cifra_js.package refinement §Constraints).
const corpusDir = fileURLToPath(new URL("../../corpus/", import.meta.url));
const ledger = JSON.parse(
  readFileSync(new URL("./corpus/expected-failures.json", import.meta.url), "utf-8"),
);
const expectedToFail = new Set(ledger);

const { reading, merge } = discover(corpusDir);

// Every discovered check, with the id the ledger addresses it by.
const checks = [
  ...reading.flatMap((entry) => readingChecks(entry, impl)),
  ...merge.flatMap((entry) => mergeChecks(entry, impl)),
];
const checkIds = new Set(checks.map((c) => c.id));

// The ledger must only name checks that exist: a stale id fails the suite, so
// the ledger stays honest as the corpus changes and cifra_js.conformance can
// prove it empty.
test("expected-failures.json names no check that does not exist", () => {
  expect(staleLedgerIds(ledger, checkIds)).toEqual([]);
});

describe("corpus conformance", () => {
  // One test per check: a ledgered check must fail, an unledgered one must
  // pass. The ledger diff of a later task shows exactly what it turned green.
  for (const check of checks) {
    test(check.id, () => {
      let error;
      try {
        check.run();
      } catch (e) {
        error = e;
      }
      if (expectedToFail.has(check.id)) {
        expect(
          error,
          `${check.id} is an expected failure but passed — prune it from expected-failures.json`,
        ).toBeDefined();
      } else if (error) {
        // An unledgered check must pass; surface the real mismatch.
        throw error;
      }
    });
  }
});
