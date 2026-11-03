# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub Security Advisories:

https://github.com/slubbles/explanimate/security/advisories/new

Describe what you found, how to reproduce it, and what you think it affects.
Do not open a public issue for anything security-sensitive.

## What to expect

- A first response within a few days.
- A fix and a public note once the issue is understood. Credit is given unless
  you ask to stay anonymous.

## Scope

The web app input handling (private-address guard, rate limits, job store),
the CLI and API link fetching, and the gallery and voice endpoints. API keys
and deployment secrets are out of scope for the repo itself: they live only in
server-side env files, so if you find one committed anywhere, report it the
same way.
