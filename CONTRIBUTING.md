# Working in this repository

1. Never push directly to `main` — it is the deploy branch.
2. Start every task on a branch from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feature/short-description
   ```
3. Commit in small, meaningful steps.
4. Push the branch and open a pull request into `main`:
   ```bash
   git push -u origin feature/short-description
   gh pr create
   ```
5. Wait for CI to pass and for a teammate to review, then merge.

## Branch names

- `feature/...` — new functionality
- `fix/...` — bug fixes
- `docs/...` — documentation

## Secrets

Never commit keys, passwords or `.env` files. Deploy secrets live in
**Settings → Secrets and variables → Actions**.
