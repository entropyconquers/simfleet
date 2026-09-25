# simfleet docs

The documentation site at https://entropyconquers.github.io/simfleet, built with
[unmint](https://github.com/gregce/unmint) (Next.js + Fumadocs) as a static export.

```bash
bun install
bun run dev        # http://localhost:3000
bun run build      # static site in out/ (set DOCS_BASE_PATH=/simfleet to mirror GitHub Pages)
bun run test
```

- Pages: `content/docs/**/*.mdx`, ordered by each folder's `meta.json`.
- Branding and colors: `lib/theme-config.ts` and `app/globals.css`.
- Landing page: `app/page.tsx`.
- Deployed by `.github/workflows/docs.yml` on pushes to `main` that touch `docs/`.

The site template is unmint by Greg Ceccarelli, used under the MIT license (see `LICENSE-unmint`).
