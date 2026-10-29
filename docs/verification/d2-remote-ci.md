# D2: remote source and CI

October 29, 2026. Pushed the app to the user-supplied private repository, preserving the remote's original MIT license commit through a merge without rewriting history.

- Source revision: `45d2528` (`D2: preserve repository license history`).
- [GitHub Actions run 40894186386](https://github.com/amit-ksh/emote-exchange/actions/runs/40894186386): completed, success.
- [Windows job](https://github.com/amit-ksh/emote-exchange/actions/runs/40894186386/job/123518697677): all steps succeeded.
- [Ubuntu job](https://github.com/amit-ksh/emote-exchange/actions/runs/40894186386/job/123518698266): all steps succeeded.

Both runners performed frozen installation, types, lint, tests, market behavior experiments, production build and the process/restart smoke test. These are actual remote results, inspected through the authenticated GitHub API. The current suite contains 162 tests.

Before pushing, the local audit compared the actual private configuration/token values against all reachable commit patches, built browser assets and a running public snapshot. No matches were found. Tracked paths exclude `.env`, databases, `references/` and `artifacts/`. The fresh-folder README check is recorded in [H4](h4-hardening.md) and [H6](h6-readme.md).

Repository visibility remains private. Judge access, a final submitted revision/tag, the project video and the submitted entry URL remain separate gates; this report does not mark the whole submission complete.
