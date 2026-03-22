# Deployment

This repo is already wired for auto-deploys on pushes to `main`.

## Production Targets

- Frontend: Vercel project `spyllio`
- Frontend URL: `https://spyllio.vercel.app`
- Backend: Render service `spyllio-server`
- Backend URL: `https://spyllio-server.onrender.com`

## Auto Deploy

- Vercel auto-deploys the frontend from this repo to production on pushes to `main`.
- Render auto-deploys the backend service `srv-d6vsddk50q8c739r6hc0` on pushes to `main`.
- Verified on `2026-03-22`:
  - Vercel marked deployment `dpl_BVWJpjgHcu2RaSZbfQaEK9o46PcS` ready for commit `f4a6814a0c6605d95fe9a6b0f7faaa5f9e013957`
  - Render marked deploy `dep-d7025i49c44c738p7q80` live for commit `f4a6814a0c6605d95fe9a6b0f7faaa5f9e013957`

## Verify A Deploy

```bash
vercel ls spyllio
vercel ls spyllio -m githubCommitSha=<commit-sha>
vercel inspect https://spyllio.vercel.app
render deploys list srv-d6vsddk50q8c739r6hc0 -o text
```

What to look for:

- Vercel: latest production deployment shows `Ready`
- Render: latest deploy shows `Live`

## Manual Fallback

If auto-deploy does not trigger, deploy manually with:

```bash
vercel --prod
render deploys create srv-d6vsddk50q8c739r6hc0
```

## Repo Notes

- Vercel is linked locally through `.vercel/project.json`
- Render service configuration lives in `render.yaml`
- The longer architecture/deployment planning notes are in `plans/DEPLOYMENT.md`
