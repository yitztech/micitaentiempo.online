import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Run alone, after the scenario suite, against its disposable TEST_MODE compose project.
const project = process.env.MCET_TEST_PROJECT;
if (!project || !["ci", "mcet-tests"].includes(project))
  throw new Error("Set MCET_TEST_PROJECT to ci or mcet-tests");
const compose = [
  "compose",
  "-f",
  "compose.prod.yml",
  "-f",
  "compose.ci.yml",
  "--env-file",
  ".env.ci",
  "-p",
  project,
];
const docker = (...args) => execFileSync("docker", [...compose, ...args], { encoding: "utf8" });
const sql = (query) =>
  docker(
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    'psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"',
    "sh",
    query,
  ).trim();
const org = randomUUID();
const owner = randomUUID();
const tick = async () => {
  const response = await fetch("http://micitaentiempo.localhost:8080/api/__test/tick", { method: "POST" });
  assert.equal(response.status, 201);
};
const state = () =>
  sql(
    `SELECT o.status || ':' || o.calendar_status_pending::text || ':' || COALESCE(c.status, 'none') FROM app.organizations o LEFT JOIN calendar.org_status c ON c.org_id::text=o.id WHERE o.id='${org}'`,
  );
let stopped = false;
try {
  sql(
    `INSERT INTO app.users(id,name,email) VALUES ('${owner}','Prueba','${owner}@escenarios.test'); INSERT INTO app.organizations(id,name,owner_user_id,plan,status) VALUES ('${org}','Prueba','${owner}','personal','active')`,
  );
  await tick();
  assert.equal(state(), "active:false:active");
  docker("stop", "calendar");
  stopped = true;
  sql(`UPDATE app.organizations SET status='read_only', calendar_status_pending=true WHERE id='${org}'`);
  await tick();
  assert.equal(state(), "read_only:true:active");
  sql(
    `UPDATE app.organizations SET status='active', calendar_status_pending=true WHERE id='${org}'; UPDATE app.organizations SET status='read_only', calendar_status_pending=true WHERE id='${org}'`,
  );
  await tick();
  assert.equal(state(), "read_only:true:active");
  docker("up", "-d", "--wait", "calendar");
  stopped = false;
  await tick();
  assert.equal(state(), "read_only:false:read_only");
  sql(`UPDATE app.organizations SET status='active', calendar_status_pending=true WHERE id='${org}'`);
  await tick();
  assert.equal(state(), "active:false:active");
  console.log("Calendar status: failed RPC, retry, and reactivation verified with real services.");
} finally {
  if (stopped) docker("up", "-d", "--wait", "calendar");
  sql(
    `DELETE FROM calendar.org_status WHERE org_id='${org}'; DELETE FROM app.organizations WHERE id='${org}'; DELETE FROM app.users WHERE id='${owner}'`,
  );
}
