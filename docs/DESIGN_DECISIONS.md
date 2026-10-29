# SkyDeploy design decisions

A living record of *why* things are built the way they are, what was traded
away, and what is still not handled. Written to be re-read months later, so
it explains instead of assuming you remember.

Last updated: 2026-10-30.

**Contents**

1. [How the system works (recap)](#1-how-the-system-works-recap)
2. [Graceful worker shutdown](#2-graceful-worker-shutdown)
3. [Part 1: surviving a worker that dies mid-deployment](#3-part-1-surviving-a-worker-that-dies-mid-deployment)
4. [Part 2: Redis failure](#4-part-2-redis-failure)
5. [Part 3: autoscaling workers](#5-part-3-autoscaling-workers) (not built yet)
6. [Operations cheat sheet](#6-operations-cheat-sheet)

---

## 1. How the system works (recap)

```
Browser -> Next.js (Vercel) -> Express API (EC2, :3001) -> Postgres (Neon)
                                        |
                                        v
                                  Redis list "deployment-queue"
                                        |
                                        v
                          Worker (pm2 process on the same EC2 box)
                            clone -> docker build -> docker run
                            -> health check -> nginx route -> SUCCESS
```

- The API creates a `Deployment` row (`QUEUED`) in Postgres and pushes its id
  onto a Redis list.
- A worker pops ids and runs the deployment, updating `status` as it goes:
  `QUEUED -> CLONING -> BUILDING -> DEPLOYING -> SUCCESS` (or `FAILED`).
- The browser polls the status and the `DeploymentLog` rows.
- One EC2 box (2 vCPU, ~1.9 GB RAM) runs the API, the worker, Redis, nginx and
  every deployed container. Postgres is external (Neon). Both the local
  `api/.env` and EC2 point at the **same** Neon database, so a local run
  touches production data. Never run migrations or tests against it locally.

---

## 2. Graceful worker shutdown

### Problem
Restarting the worker (every deploy, every `pm2 restart`) killed it
instantly. A deployment in the middle of a build was abandoned and could never
be recovered.

### What we did
- `worker.ts` listens for `SIGINT`/`SIGTERM`. The handler only sets a
  `shuttingDown` flag. The main loop is `while (!shuttingDown)`, so the
  worker stops *between* jobs and the running job always finishes.
- A second signal exits immediately (so Ctrl-C still works in development).
- The idle wait on the queue is `BRPOP ... 5` instead of `BRPOP ... 0`.
  An idle worker therefore wakes every 5 seconds and notices the flag.
- `api/ecosystem.config.cjs` sets `kill_timeout: 10 minutes` for the worker.
  pm2 sends SIGINT, then SIGKILL after `kill_timeout` (default 1.6 s, far
  too short for a build).
- `treekill: false` in the same file (see the gotcha below).

### Why the 5-second timeout instead of closing the connection
Interrupting a blocking `BRPOP` by closing the Redis connection can lose a
job: Redis may pop the id and send it at the instant we disconnect. A timeout
can never race that way because we only decide to stop *between* calls.
Cost: an idle worker takes up to 5 s to stop.

### Gotcha found by testing on EC2
pm2 by default signals the **whole process tree**. `docker build` is a child
of the worker, and Docker treats SIGINT as "cancel the build". So the first
mid-build restart cancelled the build ("context canceled") even though the
worker itself shut down gracefully. Fix: `treekill: false`, so pm2 signals
only the worker process. Verified on EC2: restart during a build waited ~20 s,
the deployment finished, then the worker restarted.

### Limits
Only planned stops. A crash, OOM kill or `kill -9` still loses the in-memory
state. That is Part 1 below.

---

## 3. Part 1: surviving a worker that dies mid-deployment

### 3.1 The problem
`BRPOP` removes the id from Redis the moment a worker takes it. If the worker
then dies, the only record of "this job is in progress" was in that worker's
memory. The row stays `BUILDING` forever, nobody retries it, and the user
watches a spinner for ever.

Two different failures need different responses:

| Kind | Examples | Response |
|---|---|---|
| The **job** failed | no Dockerfile, build error, app does not start, a step timed out | `FAILED` immediately, **no retry** (same input would fail again) |
| The **worker** died | crash, OOM kill, `kill -9`, reboot, frozen process | detect it and **retry**, up to a limit |

### 3.2 The core idea: Postgres is the truth, Redis is a hint
Postgres is durable and already holds every deployment. Redis only says
"there is probably work". It may lose or duplicate messages, and that must be
harmless. All correctness lives in Postgres.

Alternative considered: a Redis "processing list" (`BLMOVE`) plus lease keys
in Redis. Rejected because the lease would disappear if Redis restarted, so
it would not help with the Redis-failure problem (Part 2). Keeping ownership
in Postgres solves both with one mechanism.

### 3.3 The mechanisms

New columns on `Deployment` (migration `20261029170000_add_deployment_lease`,
additive only): `workerId` (text, null), `attempts` (int, default 0),
`leasedUntil` (timestamp, null), plus an index on `(status, leasedUntil)`.

**Claim** (`lease.service.ts: claimDeployment`)
After popping an id, a worker runs one conditional update (Prisma
`update({ where: { id, status: "QUEUED" }, data: { status: "CLONING",
workerId: me, attempts: { increment: 1 }, leasedUntil: now + 60s } })`).
It is a single `UPDATE ... WHERE id = ? AND status = 'QUEUED'`, so the database
lets exactly one worker match. The loser gets Prisma's "record not found"
(P2025), treats it as "someone else has it" and skips the job. Duplicates and
races are harmless.

**Lease + heartbeat** (`startLease`)
Think of a parking meter. `leasedUntil` is the paid time. While working, the
worker extends it every 20 s (`WHERE id=? AND workerId=me AND attempts=N`).
A dead worker stops extending, so the lease runs out about a minute later.
Three beats per lease means one or two missed beats do not cause a false alarm.

**Reaper** (`reaper.service.ts`)
Every worker runs it on startup and every 30 s. It does three jobs:
1. *Abandoned jobs*: status `CLONING/BUILDING/DEPLOYING` and
   `leasedUntil < now()`. If `attempts < 3` put it back to `QUEUED` (owner
   cleared) and push the id again; otherwise mark `FAILED` ("Worker stopped
   responding and the retry limit was reached") and clean up its leftovers.
2. *Too old in the queue*: `QUEUED` for more than 1 hour becomes `FAILED`
   instead of waiting forever.
3. *Lost from Redis*: `QUEUED` for more than 30 s and **not present in the
   Redis list** (`LPOS`) is pushed again. This covers a worker dying between
   popping an id and claiming it, and (partly) Redis losing data.
Every state change is a conditional `UPDATE ... WHERE <expected state>`, so
if two reapers race, only one wins.

**Idempotent retries**
A retry starts in the mess the dead attempt left. So on attempt 2+ the worker
first removes leftovers (`cleanupDeploymentResources`):
- the workspace folder (a second `git clone` into an existing folder fails),
- containers started by the dead attempt. Their ids were never saved, so
  containers are now started with the label
  `skydeploy.deployment=<id>` and found by label,
- the image and the nginx route.
Each attempt also clones into its own folder (`workspace/<id>-<attempt>`).
The log shows "attempt N of 3" so the user can see a retry happened.

**Fencing**
Problem: a worker that is *frozen*, not dead (easy on 2 vCPUs during a build)
loses its lease, the reaper requeues the job, a second worker starts, and then
the first wakes up and carries on: two workers, one deployment.
Fix: every status update from a worker includes `workerId` and `attempts` in
its `WHERE` (`updateOwned`). The stale worker's update matches zero rows, it
gets a `LeaseLostError`, and it stops. In that path it only removes the
container *it* started and leaves status, image, nginx route and logs alone,
so it cannot damage the newer attempt.

**Timeouts**
The heartbeat only proves the *process* is alive. A hung `docker build` would
keep its lease for ever. So: `git clone` 2 min, `docker build` 10 min, plus a
20-minute limit per attempt checked between stages. A timeout is a **job
failure** (FAILED, no retry): retrying a hang would just hang again.

### 3.4 Settings (`config/worker.config.ts`, env override in brackets)

| Setting | Default | Why |
|---|---|---|
| Lease | 60 s (`LEASE_SECONDS`) | short = fast recovery but more false alarms; long = slower recovery |
| Heartbeat | 20 s (`HEARTBEAT_SECONDS`) | 3 beats per lease tolerates a missed beat |
| Max attempts | 3 (`MAX_ATTEMPTS`) | survive a one-off outage, but stop a "poison" job that crashes the worker every time |
| Reaper interval | 30 s (`REAPER_INTERVAL_SECONDS`) | worst-case detection is lease + interval, about 90 s |
| Stale QUEUED | 30 s (`STALE_QUEUED_SECONDS`) | well above the normal gap between creating the row and pushing the id |
| Max queue age | 1 h (`MAX_QUEUE_AGE_SECONDS`) | do not run a deployment hours after the user asked |
| Clone / build timeout | 2 min / 10 min | see timeouts above |

### 3.5 What happens when...

| Situation | Result |
|---|---|
| Worker killed mid-build, pm2 restarts it | ~90 s later the reaper requeues it; attempt 2 runs and normally succeeds. Logs show "attempt 2 of 3". |
| Worker keeps dying on one deployment | After 3 attempts: `FAILED`, "retry limit was reached", leftovers removed |
| Bad Dockerfile / build error / app crashes | `FAILED` immediately, no retry |
| Worker frozen, lease expires, job reassigned, worker wakes up | Its next update is rejected (fencing); it stops without touching the new attempt |
| Worker dies between `BRPOP` and the claim | Row is still `QUEUED`; reaper pushes the id again after 30 s |
| Same id in Redis twice | Second claim matches nothing; skipped |
| Two reapers run at once | Conditional updates: only one acts per job |
| Long queue, job waiting its turn | `LPOS` finds it in Redis; not pushed again (no duplicates piling up) |
| Postgres briefly unreachable during a job | Heartbeats fail and are retried. If the lease really expired meanwhile, the next heartbeat reports lost and the worker stops. |
| Postgres unreachable when a job is popped | Worker logs it and waits 2 s; the row is still `QUEUED` so the reaper requeues it later |

### 3.6 Decisions and trade-offs

- **At-least-once, not exactly-once.** A worker might finish the work and die
  before recording it. Exactly-once is not achievable here, so we make
  repeating a job *safe* (idempotent cleanup) instead.
- **Prisma everywhere, no raw SQL.** First version used raw SQL so lease
  times came from the database clock (`now()`) and the claim could use
  `UPDATE ... RETURNING`. Dropped: (a) Prisma's `update` with a non-unique
  `where` is the same single conditional statement and returns the row, and
  `updateMany` conditions give the same race protection in the reaper; (b)
  the clock benefit is negligible: leases are 60 s and servers on the same
  host (or NTP-synced EC2 hosts) agree within milliseconds; (c) raw SQL loses
  type safety (a renamed column only fails at runtime) and needs
  `at time zone 'utc'` everywhere because Prisma stores `DateTime` as UTC
  without a zone, an easy thing to get wrong. Lease times therefore use the
  worker's clock (`new Date()`). If we ever run workers on hosts whose clocks
  can drift by seconds, move the timestamps back to database time.
- **Separate Redis connection for `BRPOP`.** A blocking command holds its
  connection; sharing one would make the reaper's commands wait behind it.
- **Retries go to the back of the queue.** Simpler than priority handling;
  fine at this scale.
- **Rows with `leasedUntil IS NULL` are ignored by the reaper.** Old stuck
  rows from before this change must not suddenly be re-run months later.
  (Old `QUEUED` rows *are* swept: failed once they pass the max queue age.)
- **`SUCCESS` is only written after nginx is configured.** Before, it was
  written first. A crash in between would leave a "successful" deployment with
  no route, and the reaper would ignore it because it was no longer active.
- **Per-attempt workspace, shared image tag.** The workspace is per attempt so
  a stale worker cannot delete the new attempt's source. The image tag stays
  `skydeploy:<id>`: running containers are unaffected if a stale build
  re-tags it, and per-attempt tags would complicate cleanup for no real gain.

### 3.7 Known limitations (be honest about these)

- **Lease loss is noticed at checkpoints**, not mid-step. A stale worker deep
  in a `docker build` keeps building until the build ends (bounded by the
  10-minute timeout), and only then discovers it lost ownership.
- **A zombie's container can run until the retry starts**, because cleanup
  happens at the beginning of the next attempt, which waits its turn in the
  queue.
- **Single host.** Cleanup (containers, nginx, folders) assumes the reaper
  runs on the same machine as the dead worker. Multi-host needs per-host
  reapers or a different recovery path (Part 3).
- **Redis outage / data loss**: handled in Part 2 (section 4).
- **Heartbeat adds one small Postgres write per active job every 20 s.**
  Negligible now; worth remembering at large scale.
- The retried attempt does **not** resume; it starts from scratch (re-clone,
  rebuild). Docker layer caching makes the rebuild fast.

### 3.8 How it was tested
Against a throwaway local Postgres (not the real database), the real code,
22 checks, run with the database set to UTC and to Asia/Kolkata:
atomic claim under 8 concurrent claimers; heartbeat extending a lease past its
original expiry; attempt deadline; fencing rejecting a stale worker and the
heartbeat noticing it; reaper retry / fail / ignore-healthy / ignore-legacy;
two reapers racing on one job; stale-QUEUED re-push without duplicates;
expiry of very old `QUEUED` rows.

**Tested on the real EC2 server (2026-10-29)**, with `kill -9` on the worker
(not a graceful stop):
- *Killed once mid-build:* about 70 s later the reaper requeued the job;
  attempt 2 cloned into its own folder, built, started the container and
  ended SUCCESS. No workspace folders were left behind.
- *Killed on every attempt (three times):* attempt 3's leftover folder from
  attempt 2 had been deleted at its start; after the third kill the reaper
  marked the deployment FAILED ("retry limit reached") about 60 s later and
  no container, image, workspace or nginx route remained.
- The UI showed the RETRY log lines and the final failure message correctly.

Not covered by tests: a frozen (not dead) worker that wakes up after being
replaced, tested only at the database level (fencing), not with a real frozen
process; and Redis outages (Part 2).

### 3.9 Other fixes made along the way
- `docker.service.ts` uses `execFile` (no shell, no string interpolation)
  instead of `exec`; `docker build` has a 50 MB output buffer (the default
  1 MB can fail large builds).
- `git clone` errors used to contain the full command line, including the
  user's GitHub token, and that text reached the logs and UI. They are now
  sanitized.
- The queue name was duplicated in two files; now one exported constant.

### 3.10 Files
- `api/prisma/schema.prisma` and `migrations/20261029170000_add_deployment_lease/`
- `api/src/config/worker.config.ts`: all tunables
- `api/src/services/lease.service.ts`: claim, heartbeat, fencing
- `api/src/services/reaper.service.ts`: recovery
- `api/src/services/cleanup.service.ts`: leftovers cleanup, per-attempt workspaces
- `api/src/services/docker.service.ts`, `git.service.ts`, `nginx.service.ts`, `queue.service.ts`
- `api/src/worker.ts`: the flow, now `processDeployment`

### 3.11 Likely interview questions
- **"What if the worker dies mid-job?"** Lease expires, reaper requeues (up to
  3 attempts), retry cleans up leftovers first, then runs.
- **"How do you stop two workers taking the same job?"** Atomic conditional
  `UPDATE ... WHERE status='QUEUED'`; the database serializes it.
- **"How do you know a worker is dead?"** You cannot ask it. A lease that
  stops being renewed is the signal; the trade-off is detection speed vs
  false alarms.
- **"What if it was just slow, not dead?"** Fencing: its writes are conditioned
  on `workerId`+`attempts`, so a stale worker cannot overwrite the new one.
- **"Why not exactly-once?"** Not achievable across a crash boundary; make
  operations idempotent instead.
- **"Why Postgres for ownership instead of Redis?"** Durable, already the
  source of truth, and survives a Redis restart.
- **"Why not just use BullMQ?"** It implements the same idea (stalled-job
  detection, retries). Building it by hand was to understand and defend the
  mechanism; in a larger system BullMQ is the pragmatic choice.
- **"What would you improve?"** Abort the build immediately on lease loss;
  multi-host recovery; metrics and alerting on retries.

---

## 4. Part 2: Redis failure

### 4.1 What Redis does here
Redis stores one thing: the list `deployment-queue` of deployment ids waiting
to start. Everything else (repo, status, logs, ownership) is in Postgres. So
Redis can never lose a deployment, only the *notification* that one is
waiting. After Part 1 the real decision "who runs this deployment" is made by
the atomic claim in Postgres, so a worker does not actually need Redis to
find work; Redis just lets it find work sooner.

### 4.2 What could go wrong, and what used to happen
| Problem | Before Part 2 |
|---|---|
| Redis unreachable when a user deploys | The API call to add the id either waited with no timeout (the client queues commands while reconnecting) or threw, and the `catch` marked the new deployment `FAILED` even though it was valid |
| Redis drops while the worker waits on the list | The error was not handled in the loop, so the process exited with code 1 and pm2 restarted it. The restarted process then waited for Redis to connect before doing anything, so it sat idle for the whole outage even though deployments were waiting in Postgres. |
| Redis unreachable while the reaper runs | The reaper's Redis call waited, stalling the whole pass, including steps that only need Postgres |
| Redis restarts and loses data | Waiting ids were lost; the reaper re-pushed them after ~30 s (already handled in Part 1), possibly out of order |
| The Redis container itself | Started by hand on EC2 with snapshots only (after 1 h / 5 min / 60 s depending on change counts), and not described in the repo (`docker-compose.yml` named a different container with no volume) |

### 4.3 What we changed
- **Redis is optional for finding work.** `job-source.service.ts:
  waitForNextJob` first waits on the Redis list when Redis is connected. If
  Redis is not connected, or the wait fails, it calls
  `claimNextQueued()` instead: take the oldest `QUEUED` row from Postgres
  (`ORDER BY createdAt ASC`) and claim it with the same atomic update as
  always. If nothing is waiting it pauses 5 s so it does not spin. It never
  polls Postgres while Redis is healthy.
- **The worker never exits because of Redis.** Both Redis connections start
  in the background (`connectRedis()` does not wait), so a worker started
  during an outage is immediately useful. Loop errors back off 1 s, 2 s, up
  to 30 s. Redis errors are logged at most once per 30 s per connection.
- **The API accepts deployments while Redis is down.** `enqueueDeployment`
  now returns `true`/`false` and never waits or throws because of Redis
  (the Redis client is created with `disableOfflineQueue`, so commands fail
  immediately when disconnected). If it returns `false`, the deployment stays
  `QUEUED`, a log line says "The queue is temporarily unavailable; the
  deployment will start automatically", and the API still answers `201`.
  The old "mark FAILED" branch is removed.
- **What `201` means:** "we received and saved your request", exactly as
  before. It never meant the deployment succeeded (the body has
  `status: "QUEUED"`; the UI then polls for the final `SUCCESS`/`FAILED`).
- **The reaper tolerates Redis being down.** It skips only the "push ids
  back to Redis" step; failing abandoned jobs and expiring old queued rows
  still run. Pushes are oldest first, to keep order.
- **`GET /health`** reports `database` and `redis`. Redis down is
  `degraded` (HTTP 200), database down is `down` (HTTP 503).
- **Redis persistence and repo parity.** `docker-compose.yml` now defines
  Redis as production should run it: `redis:7-alpine`, container
  `skydeploy-redis`, `--appendonly yes --appendfsync everysec`, a data
  volume, bound to `127.0.0.1`, `restart: unless-stopped`.
- **pm2 backoff.** `exp_backoff_restart_delay: 1000` for both processes.

### 4.4 pm2's restart limit (a correction)
An earlier note here said pm2 gives up after 16 restarts during a long Redis
outage. Reading pm2 7.0.4's source showed that was overstated. A restart only
counts as "unstable" if the process died within 1 s of starting **and** it
happens within ~16 s of the process being (re)started by hand. After 16 such
restarts pm2 sets it to `errored` and stops. So it protects against a process
that crashes immediately at startup (typically a bad deploy), not against a
worker that has been running for hours. With the backoff delay, restarts of a
crash-looping process spread out (1 s up to 15 s) and never reach the limit;
the trade-off is that a permanently broken deploy now retries forever every
15 s instead of stopping silently, so watch the logs / `/health` after a
deploy.

### 4.5 Decisions and trade-offs
- **Accept vs reject while Redis is down.** Accept: the user's intent is
  durably recorded in Postgres and runs seconds later. Reject would force the
  user to retry for a problem that is not theirs. Safety net: a deployment
  still `QUEUED` after 1 hour is failed by the reaper.
- **Postgres polling during an outage.** One simple query (oldest `QUEUED`
  row, `LIMIT 1`, using the `status` index) every 5 s per worker, only while
  Redis is down. That is far below what Postgres handles, and the reaper
  already queries every 30 s. The cost is up to ~5 s of extra delay.
- **Fail fast, do not queue commands in memory.** The default Redis client
  holds commands while reconnecting, which makes callers hang. Failing fast
  lets callers choose (the API accepts anyway, the worker falls back).
- **Append-only persistence, fsync every second.** Writes are tiny
  (~50 bytes per queue operation), appended in the background, so the disk
  cost is negligible at this scale. Persistence is a convenience, not what
  protects deployments (Postgres plus the reaper do), but it avoids needless
  repairs and keeps ordering.
- **Not using a Postgres-only queue (like pg-boss).** It would remove Redis
  as a dependency. We keep Redis for instant pickup and low database load;
  the fallback gives most of the resilience without the rewrite.

### 4.6 Known limitations
- Redis is still a single instance. True high availability means Redis
  Sentinel or a managed service (ElastiCache) with replicas.
- During an outage new work starts up to ~5 s later and in `createdAt` order
  rather than strict Redis order. Retried jobs go behind others.
- If Postgres is down, nothing works (expected; it is a managed service).
- Old `QUEUED` rows already in the database are failed by the reaper after an
  hour, and are never claimed by the Postgres fallback.

### 4.7 How it was tested
Locally (no production access), against a throwaway Postgres: the fallback
claims the oldest first, concurrent callers never get the same row, rows past
the max queue age are ignored; the worker loop takes the Redis path when
healthy (and does not poll Postgres), skips ids that are already taken, falls
back on a Redis error or when Redis is down, and pauses instead of spinning;
the reaper, with Redis down, still fails exhausted jobs, requeues retryable
ones and expires old rows, and pushes the missing ids once Redis returns.
Against a port with nothing listening: connecting returns immediately, the
process survives repeated failed connects, adding to the queue returns `false`
instantly, a blocking pop fails immediately, and errors are logged once per
30 s. This found and fixed a real bug: closing a never-connected Redis client
waited forever, which would have blocked a graceful shutdown during an outage.
*EC2 tests (stop Redis, deploy, restart worker, start Redis) are recorded
below once run.*

### 4.8 Files
`api/src/lib/redis.ts`, `services/queue.service.ts`,
`services/job-source.service.ts` (new), `services/lease.service.ts`
(`claimNextQueued`), `services/reaper.service.ts`, `worker.ts`, `index.ts`
(`/health`, accept-while-down), `ecosystem.config.cjs`, `docker-compose.yml`.

### 4.9 Likely interview questions
- **"What if Redis dies?"** Deployments are in Postgres; workers fall back to
  claiming the oldest queued row directly; the API still accepts requests;
  the reaper re-pushes ids when Redis returns.
- **"Then why have Redis at all?"** Instant pickup without polling the
  database, and it is the standard building block for a queue; here it is an
  optimisation, not the source of truth.
- **"Why does the API return success if the queue is down?"** `201` means
  "recorded", not "deployed"; the record is durable and something is
  guaranteed to pick it up or fail it visibly.
- **"Is polling Postgres every 5 s a problem?"** No: one cheap indexed query,
  only during outages.
- **"What are the remaining single points of failure?"** One Redis, one
  database, one EC2 host.

---

## 5. Part 3: autoscaling workers
*Not built yet.* Planned: fix port-allocation races (let Docker pick the
port, bind to localhost), per-container resource limits, then a small
controller that scales worker processes on queue depth and oldest-job age,
with cooldowns, a memory veto, and scale-down via the graceful shutdown.
Hard ceiling on this box: about 2 concurrent builds (2 vCPU, ~1.9 GB RAM).

---

## 6. Operations cheat sheet

**Env vars** (all optional): `LEASE_SECONDS`, `HEARTBEAT_SECONDS`,
`MAX_ATTEMPTS`, `REAPER_INTERVAL_SECONDS`, `STALE_QUEUED_SECONDS`,
`MAX_QUEUE_AGE_SECONDS`, `CLONE_TIMEOUT_MS`, `BUILD_TIMEOUT_MS`,
`ATTEMPT_TIMEOUT_MS`, `QUEUE_POLL_TIMEOUT_SECONDS`.

**Processes** (on EC2, defined in `api/ecosystem.config.cjs`):
`pm2 startOrReload ecosystem.config.cjs`. The worker needs `treekill: false`
and a long `kill_timeout`; do not remove them.

**Find stuck deployments**
```sql
SELECT id, status, attempts, "workerId", "leasedUntil", "updatedAt"
FROM "Deployment"
WHERE status IN ('QUEUED','CLONING','BUILDING','DEPLOYING')
ORDER BY "updatedAt";
```

**Health:** `GET /health` on the API returns `ok`, `degraded` (Redis down) or
`down` (database unreachable, HTTP 503).

**Redis on the server:** `cd api && docker compose up -d redis` (start only
Redis; the compose file also has a local-dev Postgres).

**Worker log lines worth knowing:** `Reaper: {...}` (something was
recovered), `Lease for deployment ... was lost`, `Received SIGINT, finishing
the current job`.
