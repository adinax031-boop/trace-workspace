# Validation — 11 October 2026

## Passed in the build environment

- Prettier formatting checks and browser-suite discovery.
- JavaScript syntax checks for the server, restore utility, and browser app.
- 17 automated tests using real HTTP requests and SQLite.
- Authentication requirements, HttpOnly/SameSite cookies, origin rejection, password validation, and bad-login throttling.
- Input limits, malformed JSON input, oversized requests, unknown routes, and security headers.
- Decision creation, retrieval, update, deletion, and version conflict detection.
- JSON export, transactional restore, duplicate rollback, and refusal to overwrite an existing database.
- Persistence across a server restart and session invalidation on restart.

## Not verified in this environment

- The browser journey and visual layout: Playwright was available, but no browser binary was installed. Browser download failed. The supplied end-to-end suite has **not** passed locally.
- Docker build and container execution: Docker was unavailable.
- Public HTTPS deployment, external security audit, assistive-technology testing, and load testing.
- GitHub Actions was unavailable during the initial local build. The project is now published at `adinax031-boop/trace-workspace`; consult the Actions tab for current remote validation.

## Reproduce

Use Node 24.14+:

```sh
npm ci
npm run check
npm run format:check
npm test
npx playwright install --with-deps chromium
npm run test:e2e
docker compose up --build -d
```

Configure `.env` before the Docker command. The CI workflow separately checks the browser flow and builds and smoke-tests the container. Treat those checks as release gates before a public deployment. The README illustration is a brand graphic, not a browser screenshot.
