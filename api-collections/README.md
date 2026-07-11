# Ringtail API Collections

The single home for Ringtail's API contracts — **OpenAPI specs + Bruno collections** in
one place (house convention). Kept in lockstep with the code (see `CLAUDE.md` -> "Docs are
part of done"). One `.bru` per real route, grouped into resource subfolders.

```
api-collections/
├── bruno.json                 # root collection
├── openapi/
│   └── daemon.yaml            # OpenAPI spec for services/daemon
└── services/
    └── daemon/                # Bruno collection for the local daemon
        ├── bruno.json
        ├── environments/local.bru
        └── <resource>/*.bru
```

## Open in Bruno

1. Install Bruno from [usebruno.com](https://www.usebruno.com/).
2. "Open Collection" -> select `api-collections/services/daemon/`.
3. Pick the `local` environment and fill its vars.

## Environments & credentials

| Env     | Vars              | Source |
| ------- | ----------------- | ------ |
| `local` | `baseUrl`, `token` | The daemon **boot line** (`ringtail up` prints the MCP URL + session token). |

`baseUrl` = the daemon's loopback origin (127.0.0.1 + the printed port — never hardcode it).
`token` = the **per-boot session bearer** token; it gates every `/api/*` route and `/mcp`,
and rides `/events` as the `token` query param. It rotates every boot — re-copy it each run.
