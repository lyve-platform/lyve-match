/**
 * LYVE security regression runner.
 *
 * Runs every phase suite in order and prints a per-phase and total tally.
 * Exits non-zero if any single assertion fails, so it can gate a release.
 */
const suites = [
  { label: "Phase 1 (database, auth, storage, RLS)", file: "tests/security/rls-audit.ts" },
  { label: "Phase 2 (discovery, like/pass, match, block, report)", file: "tests/security/phase2-audit.ts" },
  { label: "Phase 2 (compatibility & ranking integrity)", file: "tests/security/compatibility-audit.ts" },
  { label: "Phase 3 (messaging, conversations, realtime, reports)", file: "tests/security/phase3-audit.ts" },
];

let totalPassed = 0;
let totalFailed = 0;
const summary: string[] = [];

for (const suite of suites) {
  console.log(`\n=== ${suite.label} ===`);
  const proc = Bun.spawn(["bun", "run", suite.file], { stdout: "pipe", stderr: "inherit" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  process.stdout.write(output);

  const match = output.match(/(\d+) passed, (\d+) failed/);
  const p = match ? Number(match[1]) : 0;
  const f = match ? Number(match[2]) : 1;
  totalPassed += p;
  totalFailed += f;
  summary.push(`${suite.label}: ${p}/${p + f} passed`);
}

console.log("\n================ SECURITY SUITE SUMMARY ================");
for (const line of summary) console.log(line);
console.log(`TOTAL: ${totalPassed}/${totalPassed + totalFailed} passed, ${totalFailed} failed`);
process.exit(totalFailed === 0 ? 0 : 1);
