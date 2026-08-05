# GitHub Pages preview release gate

## Approved deployment boundary

The Pages workflow may publish only the temporary, CTA-less project preview.
The artifact must remain static, read-only, and `noindex,nofollow`; it must not
contain forms, analytics, tracking, payments, signup, or sign-in flows.

The required repository variables are:

```text
PAGES_PREVIEW_APPROVED=true
PUBLIC_PREVIEW_MODE=true
```

`PUBLIC_PILOT_REQUEST_URL` and `PUBLIC_PILOT_SIGN_IN_URL` must both be absent.
Preview mode intentionally rejects CTA destinations, and the uploaded artifact
contains no external conversion links.

Do not automatically change repository visibility, enable Pages, create the
`github-pages` environment, or set repository variables. These remain manual,
owner-controlled GitHub settings.

## One-time manual prerequisites

Before enabling the preview workflow:

1. Confirm the repository visibility is the expected visibility.
2. Confirm the owner's GitHub plan supports the intended Pages configuration.
3. Acknowledge in the release record that a deployed Pages website is public
   even when its source repository is private.
4. In **Settings → Pages**, select **GitHub Actions** as the workflow source.
5. Restrict the `github-pages` environment to deployments from `main` only.

GitHub documents private-repository availability and the public nature of a
published site in [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Approval checklist

- [ ] Repository visibility, plan, and public-site acknowledgement are recorded.
- [ ] The `github-pages` environment accepts deployments only from `main`.
- [ ] Only `PAGES_PREVIEW_APPROVED=true` and `PUBLIC_PREVIEW_MODE=true` are set
      for the release gate; both CTA URL variables are absent.
- [ ] `npm ci --registry=https://registry.npmjs.org` passes.
- [ ] `npm audit --audit-level=high --registry=https://registry.npmjs.org`
      reports no high-severity vulnerabilities.
- [ ] `npm run pages:preflight` prints `Pages preview preflight passed`.
- [ ] `npm run verify` passes in preview mode.
- [ ] The rebuilt artifact passes `npm run test:static` immediately before
      upload.
- [ ] The final artifact remains `noindex,nofollow` and contains no form,
      payment, signup, sign-in, or external CTA.
- [ ] A migration gate to a suitable commercial static host is recorded before
      active marketing or sales begin.

## Operating boundary and rollback

This deployment is a temporary, non-transactional project demonstration. It
must not become the host for an active SaaS business. GitHub's [Pages
limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
remain the controlling platform boundary.

To stop future deployments, unset `PAGES_PREVIEW_APPROVED`. To withdraw an
already published preview, disable the Pages site in GitHub settings as a
separate manual action; do not change repository visibility as a rollback.
