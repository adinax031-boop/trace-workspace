<div align="center">

# trace.

### Good decisions leave a trace.

A quiet, private home for the reasoning behind your engineering decisions.

**Self-hosted · Zero runtime dependencies · MIT licensed**

</div>

![Trace — Good decisions leave a trace](docs/banner.svg)

## The idea

You remember what you built. Do you remember why?

Trace is a small decision journal for software builders and researchers. Capture the context, the choice, and the evidence while the reasoning is fresh. Mark a decision **Exploring**, **Accepted**, or **Revisited**. Search across projects and keep your thinking portable.

It's deliberately a personal workspace: one server, one shared password, no external accounts, no telemetry, and no AI service required.

## What works

- Create, edit, and delete decisions with context, evidence, project, and tags.
- Search every field; filter by project and decision status.
- Dashboard counts and an optional six-record sample journal.
- Responsive interface, keyboard-operable controls, labeled forms, and reduced-motion support.
- SQLite persistence, parameterized queries, WAL mode, and conflict detection for stale edits.
- Password authentication with random server-side sessions and HttpOnly, SameSite cookies.
- Same-origin write checks, a strict content security policy, request size limits, and login throttling.
- JSON export and validated, transactional offline restore to a new database.
- Non-root Docker image, persistent volume, health endpoint, graceful shutdown, and CI.

## Start in two minutes

Install **Node.js 24 LTS, version 24.14 or newer**. No `npm install` is needed to run the app: it uses built-in modules only. Development tools are optional.

```sh
cp .env.example .env
```

Edit `.env` and replace `TRACE_PASSWORD` with a long random password. Then:

```sh
node --env-file=.env server.js
```

Open **http://127.0.0.1:3000**. Sign in and create a decision, or click **Try a sample journal**.

Use the exact configured origin. `localhost` and `127.0.0.1` are different origins.

```sh
npm run check
npm test
```

`npm start` reads environment variables already exported by your shell. It does not automatically read `.env`. `npm run dev` enables Node's file watcher; export the environment first or use `node --env-file=.env --watch server.js`.

## Browser tests

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

The suite runs a separate server and temporary database. It covers sign-in, sample data, create, search, edit, reload persistence, delete, export, mobile overflow, and logout. Browser binaries are required.

## Docker

```sh
cp .env.example .env
# Edit .env before starting.
docker compose up --build -d
```

The default port binds only to the host's loopback interface. Data lives in the `trace-data` volume. Stop with `docker compose down`. Adding `-v` deletes the volume and its data.

For a public deployment, place the service behind an HTTPS reverse proxy and set:

```dotenv
TRACE_ORIGIN=https://trace.example.com
TRACE_SECURE_COOKIE=true
```

The proxy must preserve the browser's `Origin` header. Trace doesn't trust forwarded IP headers: login throttling uses the immediate peer address. Behind a proxy, the limit is therefore shared by users of that proxy.

A file-mounted password can be used by setting `TRACE_PASSWORD_FILE=/run/secrets/trace_password` instead of `TRACE_PASSWORD`. The app reads this file at startup. See [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/) for file mounting.

## Configuration

| Variable              | Default                 | Purpose                                    |
| --------------------- | ----------------------- | ------------------------------------------ |
| `TRACE_PASSWORD`      | Required                | Workspace password, at least 12 characters |
| `TRACE_PASSWORD_FILE` | Unset                   | Read a password file; takes precedence     |
| `TRACE_DB`            | `data/trace.db`         | SQLite database path                       |
| `TRACE_ORIGIN`        | `http://127.0.0.1:3000` | Exact browser origin for write requests    |
| `TRACE_SECURE_COOKIE` | `false`                 | Set `true` behind HTTPS                    |
| `HOST`                | `127.0.0.1`             | Bind address; Docker uses `0.0.0.0`        |
| `PORT`                | `3000`                  | Listening port                             |

Sessions expire after 24 hours. Restarting the server invalidates every session. To rotate the password, update its environment variable or file and restart.

## Back up and restore

Click **Export backup** while signed in. Store the JSON securely: it contains the entire journal in plain text.

To restore on the host:

```sh
# Stop Trace first.
node restore.js trace-backup.json data/restored.db
# Point TRACE_DB to data/restored.db, then start Trace.
```

Restore refuses to overwrite an existing database. It validates records and metadata and commits everything in one transaction. Duplicate IDs roll back the restore. Limits: 10 MiB and 10,000 records per JSON restore. For larger workspaces, use SQLite's backup tooling or copy the database and its WAL only after stopping Trace. Test a restore before relying on a backup.

For Docker, keep the downloaded backup in the current directory and run:

```sh
docker compose stop trace
docker compose run --rm --no-deps -v "$(pwd)/trace-backup.json:/backup.json:ro" trace node restore.js /backup.json /app/data/restored.db
```

Set `TRACE_DB=/app/data/restored.db` in `.env`, then run `docker compose up -d`. The CLI reuses the same persistent volume. Keep the original database until verification is complete.

## How it is built

```text
Browser → same-origin HTTP API → Node.js → SQLite
```

`public/` contains plain HTML, CSS, and JavaScript. Content is rendered with `textContent`, never inserted as HTML. The Node server serves an explicit asset allowlist and authenticated API. SQLite provides atomic updates; a version number protects against stale browser writes. The app stores plain-text content, not rendered Markdown.

| File                       | Responsibility                                     |
| -------------------------- | -------------------------------------------------- |
| `server.js`                | HTTP, authentication, validation, database access  |
| `public/app.js`            | Interface state and API interactions               |
| `public/style.css`         | Responsive visual design                           |
| `restore.js`               | Offline transactional backup restore               |
| `test/`                    | API, persistence, and restore tests                |
| `.github/workflows/ci.yml` | Syntax, tests, image build, container health check |

## Production scope

This release targets a modest personal or small trusted-group workspace on a **single instance**. It is not a multi-tenant SaaS. The shared password does not distinguish users. There are no roles, audit identities, email recovery, attachments, collaborative live editing, or encryption at rest. SQLite reads and password hashing use synchronous Node APIs; very high traffic needs a different concurrency design. Search loads all records into the browser, so large workspaces need pagination and server-side search.

Don't run multiple app processes against the same database: startup deliberately clears sessions. Secure the host, terminate HTTPS, retain backups, monitor `/health`, and keep Node patched. The repository's Docker image tracks Node 24; pin a tested image digest for reproducible deployments.

See [VALIDATION.md](VALIDATION.md) for exactly what was checked and what remains unverified.

## Get the source

```sh
git clone https://github.com/adinax031-boop/trace-workspace.git
cd trace-workspace
```

The `Verify` workflow runs on pushes and pull requests. Check it before deploying.

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md). Good first contributions: server-side pagination, a Markdown export, accessible focus refinements, and a decision timeline. Open an issue to discuss larger changes before coding.

[Security policy](SECURITY.md) · [MIT license](LICENSE)
