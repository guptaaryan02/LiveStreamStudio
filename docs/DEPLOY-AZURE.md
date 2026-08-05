# Deploying the landing page to Azure

The landing page is the same Vite build as the desktop app's UI. When the page
is opened in a normal browser it renders the marketing site; the studio UI only
takes over inside the Tauri desktop shell (or at `#/studio`).

Build output is a plain static site — no server, no Node runtime at runtime:

```bash
npm ci
npm run build     # outputs dist/
```

Everything routes through the hash (`#/download`, `#/support`), so no server
rewrite rules are strictly required. `staticwebapp.config.json` is included
anyway for caching and security headers.

## Option A — Azure Static Web Apps (recommended)

Cheapest and simplest: there is a free tier, TLS and a CDN are included.

1. In the Azure Portal: **Create a resource → Static Web App**
2. Deployment source: **GitHub**, pointing at `guptaaryan02/LiveStreamStudio`
3. Build details:
   - App location: `/`
   - Api location: *(leave empty)*
   - Output location: `dist`
4. Azure adds a workflow to the repo and deploys on every push to `main`.

The included `staticwebapp.config.json` is picked up automatically.

**Private repo note:** Static Web Apps needs read access to the repo. The
portal handles that via the GitHub authorization step, so a private repo is
fine.

## Option B — Azure App Service

Use this if you already have an App Service plan.

For **Linux** App Service, static files need a web server. The simplest setup:

```bash
npm run build
cd dist
zip -r ../site.zip .
az webapp deploy --resource-group <group> --name <app> --src-path ../site.zip --type zip
```

Then set the startup command to serve the folder statically:

```
pm2 serve /home/site/wwwroot --no-daemon --spa
```

For **Windows** App Service, deploy `dist/` and add a `web.config` with a
rewrite rule to `index.html`. Static Web Apps avoids all of this, which is why
it is the recommended option.

## After deploying

- Download buttons point at GitHub release assets in
  `guptaaryan02/LiveStreamStudio-releases`. Those URLs **404 until the release
  is published** — a draft release's assets are not public.
- Bumping a release means editing one constant, `RELEASE_TAG`, in
  `src/components/marketing/MarketingSite.tsx`, plus the file sizes.
- Donation links on the support page are still placeholders
  (`buymeacoffee.com`, `paypal.me`) — replace them with your real links before
  announcing the site.
- Visitors can reach a non-functional studio UI at `#/studio`. It cannot stream
  from a browser. If that is confusing, gate it behind an environment flag at
  build time.
