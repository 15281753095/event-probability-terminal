# GitHub Publish Runbook

This runbook prepares the repository for GitHub. It does not require publishing during normal local development.

## Preconditions

- License is MIT.
- CI workflow exists at `.github/workflows/ci.yml`.
- Issue templates and pull request template exist under `.github/`.
- README reflects the current fixture-first read-only status.
- No secrets, API keys, private keys, cookies, wallet credentials, or auth headers are committed.

## Create A GitHub Repository

Create an empty repository named `event-probability-terminal` in GitHub.

Recommended initial settings:

- Do not initialize with a README, license, or `.gitignore`; those files already exist locally.
- Choose public or private visibility intentionally.
- Keep Actions enabled.

## Initialize Local Git If Needed

This working directory currently may not be a git repository. If `.git/` is absent:

```bash
git init -b main
git add .
git commit -m "Initialize Event Probability Terminal"
```

If the directory is already a git repository, inspect changes first:

```bash
git status --short
git add .
git commit -m "Standardize repository foundation"
```

## Add Remote

Replace the URL with the repository URL you created:

```bash
git remote add origin git@github.com:<owner>/event-probability-terminal.git
```

If `origin` already exists:

```bash
git remote -v
git remote set-url origin git@github.com:<owner>/event-probability-terminal.git
```

## Push Main

```bash
git push -u origin main
```

Do not push from automation without explicit user approval and a confirmed repository URL.

## Default Branch

In GitHub repository settings:

- set `main` as the default branch;
- delete unused bootstrap branches if any exist.

## Branch Protection

Recommended minimal protection for `main`:

- require pull requests before merging;
- require status checks to pass;
- require the `CI / checks` workflow;
- disallow force pushes;
- require conversation resolution if using reviews.

Keep the rules simple until the project has more contributors.

## GitHub Actions Permissions

Recommended minimal setting:

- Workflow permissions: read repository contents.
- Allow pull request workflows only as needed.

The current CI does not need package publishing, deployments, write tokens, or secrets.

## Tags And Releases

Do not create a tag or release as part of the RC-0 repository publish flow.

If a release tag is needed later, choose it deliberately after a separate release decision:

```bash
git tag v0.1.0-fixture-readonly
git push origin v0.1.0-fixture-readonly
```

This is a later manual step, not part of the current GitHub publish preparation.
