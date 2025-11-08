# Docs publishing: maintainer notes (MVP)

What this change does:
- Publishes the `docs/` folder to GitHub Pages on merges to `main` via GitHub Actions.

How to extend:
- To add a generated API site (TypeDoc, Docusaurus), add a build step before `upload-pages-artifact` that outputs HTML into a directory (e.g., ./site-dist), then change the `path` to that directory.
- To add API surface checks later, create a new PR job that runs generation (TypeDoc / API Extractor) and compares generated artifacts with checked-in versions.

How to verify:
- Merge the PR and watch the Publish workflow run. The action logs will show deployment success and the Pages URL.
