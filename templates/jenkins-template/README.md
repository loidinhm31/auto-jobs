url:
https://jenkins-example.example-domain.com/job/Container%20Platform/job/XX/job/job-id/job/Service%20Name/job/Build/job/Build%20Servie%20Name/job/release%252Fsit/

## Fixture and navigation contract

This capture is selector and URL evidence only. It is not production markup:
the Blink snapshot contains stale hosts, third-party resources, and vendor CSS.
The deterministic local Jenkins fixture and generated report remain the runtime
sources.

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
