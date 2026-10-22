# AGENT.md

Brief notes for AI agents working in this repository.

## Git authentication

- Push/pull over HTTPS authenticate via **Git Credential Manager (GCM)**; the fine-grained
  GitHub token is held encrypted in Windows Credential Manager (`git:https://github.com`).
- Never read or request the token, and never embed it in remote URLs or config files.
- Token scope: fine-grained PAT, only this repository, **Contents: Read and write**.

### If authentication fails (e.g. token expired)

The user replaces the token themselves — agents never see it. Tell the user to run this in a
PowerShell window (any folder works):

```powershell
"protocol=https`nhost=github.com`nusername=github`n" | git credential reject 2>$null

$sec = Read-Host -AsSecureString "Paste your fine-grained GitHub token"
$b   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$t   = [Runtime.InteropServices.Marshal]::PtrToStringAuto($b)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)

"protocol=https`nhost=github.com`nusername=github`npassword=$t`n`n" | git credential approve

$t = $null; $b = $null; $sec = $null
```

Verify with `git ls-remote origin` afterwards (no prompt = stored credential works).

## Secrets

**Never read, display, stage, or commit `.env`** (real credentials inside). Work from
`.env.example` only; keep it in sync when new variables are introduced.

## Commits

Use Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
