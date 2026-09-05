url:
https://jenkins-example.example-domain.com/job/Container%20Platform/job/XX/job/job-id/job/Service%20Name/job/Build/job/Build%20Servie%20Name/job/release%252Fsit/

## Fixture and navigation contract

This capture is a checked-in offline fixture and selector/URL evidence. It is
not served wholesale: the snapshot contains stale hosts, third-party
resources, and vendor CSS. Template-only Playwright routes serve this corpus
at exact configured and discovered URLs for tests. The report command does not
read templates automatically and has no `REPORT_SOURCE` mode.

The nested path demonstrates Jenkins folder URLs. Decode each configured job
segment once, then encode it once when generating `/job/<segment>/` links. The
`release%252Fsit` segment intentionally preserves a branch slash through the
two URL-encoding layers.

Captured landmarks map to generated report destinations as follows:

| Captured evidence | Generated destination | Live source rule |
| --- | --- | --- |
| Exact Jenkins job URL and heading | `#jenkins` | Same canonical Jenkins origin/context |
| Archived `snyk-results.html`/Snyk report | `#snyk-test-report` | Jenkins artifact or configured Snyk origin |
| SonarQube Quality Gate link | `#sonarqube-home` | Explicit project SonarQube origin |
| Sonar Overview → Overall action | `#sonarqube-overall` | Same validated Sonar project |
| Sonar Issues action | `#sonarqube-issues` | Same validated Sonar project |

Only validated HTTP(S) URLs become live links. The generated report contains
normalized evidence and screenshots; it never copies this capture's HTML/CSS.

## Static template hub navigation

The five saved pages include a passive `Vulnerability reports` navigation bar:
Jenkins hub, Snyk report, SonarQube home, SonarQube overall, and SonarQube
issues. Links are explicit relative anchors with `_self` targets, so they work
without JavaScript and also override the Snyk snapshot's `_blank` base target.
The active page is marked with `aria-current="page"`.

Run the template-only browser check from the repository root:

```sh
npm run test:e2e:templates
```

It starts at this Jenkins fixture and follows every Snyk/Sonar destination.
This checks static fixture navigation. The report regression also exercises the
normal direct capture/normalization/rendering path and writes
`reports/<project>/<run>/index.html`, `data.json`, `manifest.json`, and the
three local screenshots. `test-results/` remains reserved for Playwright
test-runner output.

## View the generated report

Run these commands from the repository root. The report is project-local and
ignored by Git; it is not written to the operating-system `/tmp` directory:

```sh
npm run report -- --config config/authorized-projects.json
npm run serve:report
```

The second command serves `reports/` at `http://127.0.0.1:4173/`. To view it
from another device on a trusted LAN, bind explicitly to all host interfaces:

```sh
npm run serve:report -- --host 0.0.0.0 --allow-lan --port 4173
```

Open `http://<this-machine-LAN-IP>:4173/`. `0.0.0.0` binds all IPv4
interfaces, so configure a firewall and do not use it on an untrusted or
public network. For narrower exposure, use `--host <this-machine-LAN-IP>`
with `--allow-lan`. The server is read-only and has no authentication. Use
`--root <directory>` or `REPORT_ROOT=<directory>` only for an intentionally
different, canonical report root.

## Template HTTP server (`createTemplateServer`)

For browser preview and real HTTP execution (e.g., Control Page runners),
the template corpus can be served over real HTTP using a dedicated, standalone
mock server implemented in [`src/templates/template-server.ts`](../../src/templates/template-server.ts) and exported through the public fixture facade [`src/templates/template-report-fixture.ts`](../../src/templates/template-report-fixture.ts).

The server dynamically remaps offline template links, forms, and destinations in memory
via `loadTemplateReportFixture(env, origin)` without modifying checked-in HTML files on disk.
It defaults to port `4174`, isolating fixture execution from the Control Page server (`4173`)
under the Same-Origin Policy.

### Programmatic API

```ts
import {
  createTemplateServer,
  type TemplateServerHandle,
  type TemplateServerOptions,
} from '../../src/templates/template-report-fixture.js';
```

#### `createTemplateServer(options?: TemplateServerOptions): Promise<TemplateServerHandle>`

Starts a native Node.js HTTP server (`node:http`) serving the loaded fixture.

##### Options (`TemplateServerOptions`)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `host` | `string` | `'127.0.0.1'` | Hostname or IP address to bind. Must be 1–255 chars without whitespace or control characters. |
| `port` | `number` | `4174` | TCP port to listen on (0–65535). Pass `0` to allocate an ephemeral port. |
| `allowLan` | `boolean` | `false` | Must be explicitly `true` if binding to a non-loopback host (e.g., `0.0.0.0` or LAN IP). |
| `env` | `NodeJS.ProcessEnv` | `process.env` | Environment dictionary used by `loadTemplateReportFixture` for origin remapping. |

##### Return handle (`TemplateServerHandle`)

| Property / Method | Type | Description |
| --- | --- | --- |
| `server` | `http.Server` | Underlying Node.js HTTP server instance. |
| `host` | `string` | Configured host address string. |
| `port` | `number` | Resolved TCP port (especially useful when listening on port `0`). |
| `url` | `string` | Base server URL with trailing slash (e.g., `http://127.0.0.1:4174/`). |
| `fixture` | `TemplateReportFixture` | In-memory loaded and rewritten template fixture snapshot. |
| `close()` | `() => Promise<void>` | Gracefully stops the server. Forcefully destroys lingering sockets after a 2-second grace period. Idempotent. |
| `resetAuthState()` | `() => void` | Resets the in-memory SonarQube authentication flag back to `false`. |

### HTTP routing and behavior

All successful responses include `Cache-Control: no-store, must-revalidate` and `X-Content-Type-Options: nosniff`.

#### HTTP method handling

- **Allowed methods**: `GET`, `HEAD`, `POST`.
- **Unsupported methods** (`PUT`, `DELETE`, `PATCH`, etc.): Return `405 Method Not Allowed`.
- **HEAD requests**: Return identical status code and headers as `GET`, but with an empty body.
- **Request sanitization**: Requests with malformed URL encoding or paths containing null bytes (`\u0000`) return `400 Bad Request`.
- **Origin gating**: Requests where `url.origin !== origin` return `404 Not Found`.

#### POST redirect handlers

All valid POST endpoints return HTTP `302 Found`:

| Endpoint | Condition / Target | Status | Redirect target | Side effect |
| --- | --- | --- | --- | --- |
| `fixture.loginActionUrl` or `/j_spring_security_check` | Jenkins login submission | `302` | `fixture.jobUrl` | None |
| `fixture.sonarqubeLoginActionUrl`, `fixture.sonarqubeLoginUrl`, or `/sessions/new` | SonarQube authentication submission | `302` | `fixture.sonarqubeHomeUrl` | Sets `sonarqubeAuthenticated = true` |
| `fixture.buildActionUrl` | Jenkins build submission | `302` | `fixture.jobUrl` | None |
| Any other POST target | Unrecognized route | `404` | — | None |

#### SonarQube authentication guard

When a client sends a `GET` or `HEAD` request to `fixture.sonarqubeHomeUrl`:
- **Unauthenticated** (`!sonarqubeAuthenticated`): Returns `200 OK` with `fixture.sonarqubeLoginHtml` (`text/html; charset=utf-8`).
- **Authenticated** (`sonarqubeAuthenticated === true` after POST to `/sessions/new`): Returns `200 OK` with `fixture.sonarqubeHomeHtml` (`text/html; charset=utf-8`).
- Calling `handle.resetAuthState()` resets the state back to unauthenticated.

#### GET / HEAD fixture endpoints

URLs mapped by [`templateResponse`](../../src/templates/template-fixture-routes.ts):

| Fixture endpoint | Content-Type | Source HTML / Content |
| --- | --- | --- |
| `fixture.loginUrl` | `text/html; charset=utf-8` | Rewritten Jenkins login page |
| `fixture.jobUrl` | `text/html; charset=utf-8` | `fixture.jenkinsHtml` (job hub) |
| `fixture.buildPageUrl` | `text/html; charset=utf-8` | `fixture.buildHtml` (build detail page) |
| `fixture.snykReportUrl` | `text/html; charset=utf-8` | `fixture.snykHtml` (Snyk HTML report) |
| `fixture.snykSummaryUrl` | `application/json; charset=utf-8` | Rewritten Snyk JSON summary |
| `fixture.sonarqubeLoginUrl` | `text/html; charset=utf-8` | `fixture.sonarqubeLoginHtml` |
| `fixture.sonarqubeOverallUrl` | `text/html; charset=utf-8` | `fixture.sonarqubeOverallHtml` |
| `fixture.sonarqubeIssuesUrl` | `text/html; charset=utf-8` | `fixture.sonarqubeIssuesHtml` |
| Unrecognized path | `text/plain; charset=utf-8` | `404 Not Found` |

### Programmatic usage example

```ts
import { createTemplateServer } from './src/templates/template-report-fixture.js';

// Start server on default loopback port 4174 (or pass port: 0 for an ephemeral port)
const server = await createTemplateServer({ host: '127.0.0.1', port: 4174 });
console.log(`Template server listening at ${server.url}`);

try {
  // 1. Visit Jenkins job page
  const jobResponse = await fetch(server.fixture.jobUrl);
  const jobHtml = await jobResponse.text();

  // 2. Unauthenticated SonarQube home yields login page
  const unauthHome = await fetch(server.fixture.sonarqubeHomeUrl);
  console.log(await unauthHome.text()); // fixture.sonarqubeLoginHtml

  // 3. Authenticate via POST
  await fetch(server.fixture.sonarqubeLoginActionUrl, {
    method: 'POST',
    redirect: 'manual',
  });

  // 4. Authenticated SonarQube home yields home page
  const authHome = await fetch(server.fixture.sonarqubeHomeUrl);
  console.log(await authHome.text()); // fixture.sonarqubeHomeHtml

  // 5. Submit a Jenkins build
  const buildPost = await fetch(server.fixture.buildActionUrl, {
    method: 'POST',
    redirect: 'manual',
  });
  console.log(buildPost.headers.get('location')); // Redirects to fixture.jobUrl
} finally {
  // Gracefully stop the server
  await server.close();
```

