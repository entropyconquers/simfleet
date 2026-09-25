# Security policy

## Supported versions

Security fixes land on the latest minor release.

## Model

`simfleet serve` binds to `127.0.0.1` and has no authentication. Any process running as your user can
drive devices, start Metro servers, and create worktrees through it, the same way it could with
`xcrun simctl`, `adb`, or `git` directly. Exposing the port beyond localhost (port forwarding, tunnels,
`0.0.0.0` proxies) is unsupported and unsafe.

## Reporting a vulnerability

Please report privately through GitHub's
[private vulnerability reporting](https://github.com/entropyconquers/simfleet/security/advisories/new)
rather than a public issue. Include the version, a description, and reproduction steps. You should get
a response within a week.
