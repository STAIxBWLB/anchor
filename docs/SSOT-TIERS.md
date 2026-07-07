# Skills SSOT Tiers

Maru treats skills as a federated catalog with one owner per skill name.

| Tier | Location | Identity | Change Path |
|------|----------|----------|-------------|
| T1 Core | `dev/maru/skills/skills/<name>/` | Maru-bundled skill embedded in the app | `dev/maru` PR |
| T2 Public | `~/.maru/skills/_sources/skills-public/skills/<name>/` | Public reusable skill | `STAIxBWLB/skills` PR |
| T3 Private | `~/.maru/skills/_sources/skills-private/skills/<name>/` | Private or identity-bearing skill | `entelecheia/skills` push |
| T4 Imported | `~/.maru/skills/_imported/skills/<name>/` | Explicitly imported external skill | `maru skills import` |
| T5 Managed Local | `~/.maru/skills/_managed/<name>/` | Local-only managed skill | Maru local registry |

## Invariants

- One skill name belongs to one tier only.
- Duplicate names across registered sources are registry validation errors.
- Duplicate or misplaced skills are visible for repair but cannot install or dispatch.
- `public` and `private` tiers are valid only in their matching `_sources/skills-public` or `_sources/skills-private` checkouts.
- Runtime edits are allowed, but the owner tier determines the reconcile path.
- External legacy skills remain outside Maru management unless explicitly imported.

## Reconcile Paths

- T1 dirty runtime copy: revert, or change `dev/maru`, or promote to T2/T3.
- T2 dirty source: commit/push in `STAIxBWLB/skills`.
- T3 dirty source: commit/push in `entelecheia/skills`.
- T4 dirty imported skill: accept the local/imported state or unmanage it.
- T5 dirty managed skill: accept the local registry state or delete.

## Commands

```bash
maru doctor --quiet
maru skills dirty --json
maru skills reconcile <name-or-id> --accept --message "maru: reconcile <name>"
maru skills reconcile <name-or-id> --discard
maru skills import /path/to/skill --copy
maru skills import-unmanage <name> --delete-files
```
