url:
https://jenkins-example.example-domain.com/job/Container%20Platform/job/XX/job/job-id/job/Service%20Name/job/Build/job/Build%20Servie%20Name/job/release%252Fsit/

## Fixture and navigation contract

This capture is a checked-in offline report source as well as selector and URL
evidence. It is not served wholesale: the Blink snapshot contains stale hosts,
third-party resources, and vendor CSS. The default `npm run report` command
reads this Jenkins snapshot together with the Snyk and SonarQube snapshots,
serves them through bounded Playwright fixture routes, and writes a normalized
report.
No Jenkins job or external vendor is contacted. Use
`REPORT_SOURCE=jenkins npm run report` only for the separately authorized live
collector path.

The nested path demonstrates Jenkins folder URLs. Decode each configured job
segment once, then encode it once when generating `/job/<segment>/` links. The
`release%252Fsit` segment intentionally preserves a branch slash through the
two URL-encoding layers.

Captured landmarks map to generated report destinations as follows:

| Captured evidence | Generated destination | Live source rule |
| --- | --- | --- |
| Exact build URL and heading | `#jenkins` | Same canonical Jenkins origin/context |
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

It starts at this Jenkins snapshot and follows every Snyk/Sonar destination.
This checks static fixture navigation. The report regression also exercises the
normal capture/normalization/rendering path and writes `reports/index.html`,
`reports/<project>/<build>/<run>/index.html`, `data.json`, `manifest.json`,
and the three local screenshots. `test-results/` remains reserved for
Playwright test-runner output.

## View the generated report

Run these commands from the repository root. The report is project-local and
ignored by Git; it is not written to the operating-system `/tmp` directory:

```sh
PROJECT_ID=local-build-now PROJECT_NAME='Local Build Now' npm run report
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
