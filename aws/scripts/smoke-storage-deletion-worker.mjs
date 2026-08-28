import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function runAws(args) {
  const result = spawnSync("aws", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `aws ${args[0]} failed with exit code ${result.status}`);
  }
  return result.stdout.trim();
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv.includes("--help")) {
  console.log("Usage: pnpm run smoke:storage-deletion-worker -- --stack <stack-name> [--region <region>] [--profile <profile>]");
  process.exit(0);
}

const stackName = option("--stack") ?? process.env.STORAGE_DELETION_STACK_NAME;
if (!stackName) {
  throw new Error("Provide --stack or STORAGE_DELETION_STACK_NAME");
}

const commonArgs = [];
const region = option("--region");
const profile = option("--profile");
if (region) commonArgs.push("--region", region);
if (profile) commonArgs.push("--profile", profile);

const functionName = runAws([
  "cloudformation",
  "describe-stacks",
  "--stack-name",
  stackName,
  "--query",
  "Stacks[0].Outputs[?OutputKey=='StorageDeletionWorkerName'].OutputValue",
  "--output",
  "text",
  ...commonArgs,
]);
if (!functionName || functionName === "None") {
  throw new Error(`Stack ${stackName} does not expose StorageDeletionWorkerName`);
}

const directory = mkdtempSync(join(tmpdir(), "mechpro-lambda-smoke-"));
const payloadPath = join(directory, "response.json");
try {
  const metadata = JSON.parse(runAws([
    "lambda",
    "invoke",
    "--function-name",
    functionName,
    "--cli-binary-format",
    "raw-in-base64-out",
    "--payload",
    "{}",
    payloadPath,
    "--output",
    "json",
    ...commonArgs,
  ]));
  if (metadata.FunctionError) {
    throw new Error(`Lambda returned ${metadata.FunctionError}: ${readFileSync(payloadPath, "utf8")}`);
  }
  if (metadata.StatusCode !== 200) {
    throw new Error(`Lambda invoke returned status ${metadata.StatusCode}`);
  }

  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  if (!Number.isInteger(payload.succeeded) || !Number.isInteger(payload.failed)) {
    throw new Error(`Unexpected Lambda response: ${JSON.stringify(payload)}`);
  }
  console.log(`Storage deletion worker smoke test passed: ${JSON.stringify(payload)}`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}