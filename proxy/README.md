# DLC course proxy

One small server the instructor runs. It does three jobs:

1. **Key custody** — your Anthropic API key lives only here (env var).
   Students' tools relay LLM calls through `/v1/llm`; 

2. **Machine-keyed limits that survive re-downloads** — every install
   reports an anonymous id derived from the OS machine identifier. The
   proxy enforces per-day call budgets per feature (Mode A, Mode B,
   grading, explain) as the wipe-proof backstop behind the client's
   own per-analysis limits.

3. **Telemetry ingest** — students' local event spools sync here. 
   `/admin/summary` shows machines, event counts and an LLM spend estimate.

## Run it

Anywhere with Python 3.12 + this repo cloned (campus VM, a $5 cloud
box, or your own desktop (option A in instructor guide) for smoke tests):

```bash
export ANTHROPIC_API_KEY=sk-ant-...     # your existing course key
export DLC_COURSE_TOKEN=<any-long-random-string-you-invent>
export DLC_ADMIN_TOKEN=<a-different-long-random-string>
export DLC_PROXY_DB=/path/to/dlc_proxy.db   # default: ./dlc_proxy.db
uv run uvicorn proxy.dlc_proxy:app --host 0.0.0.0 --port 8321
```

On Windows there is no `export`: PowerShell uses `$env:ANTHROPIC_API_KEY =
"..."`, Command Prompt uses `set ANTHROPIC_API_KEY=...` (no quotes, no
spaces around `=`). Set them and start the proxy in the same window.

Check it's alive, from the proxy machine: `curl http://localhost:8321/v1/health`.
`"course_token_set"` must read `true` — when it is false the proxy has no
course token and therefore accepts *everyone*, which looks exactly like
working normally from the student side.

Give students `http://<the proxy machine's LAN IP>:8321` as the course
server URL, plus the DLC_COURSE_TOKEN value. They paste both in the tool's
settings (stored in their `~/.dlc/config.json` as `proxy_url` /
`proxy_token`). `localhost` only ever works on the proxy machine itself —
[the instructor guide](../docs/RELEASE_GUIDE.md) shows how to find the LAN
address on each OS.

## Endpoints

| Route | What |
|---|---|
| `POST /v1/llm` | LLM relay (course-token gated): checks the machine's daily budget, attaches your key, forwards through the same client wrapper the tool uses, logs usage. |
| `POST /v1/events` | Telemetry batch ingest, deduped on (machine, row id); stamps each machine's authoritative first-seen date. |
| `GET /v1/health` | Liveness + counts. |
| `GET /admin/summary?token=…` | Machines (first/last seen, versions, counts), event kinds, spend estimate. |
| `GET /admin/export.csv?token=…&table=events\|machines\|llm_calls` | Raw CSVs for the evaluation pipeline. |

## Notes

- Per-machine budgets live in `CALL_BUDGETS` at the top of `dlc_proxy.py`
  (per machine, per server-day, per feature); the whole-class breaker is
  `DLC_GLOBAL_DAILY_CALLS` (600) and `DLC_GLOBAL_DAILY_USD` (20) in the
  environment. The README's *Changing the limits* section shows all three
  layers side by side.
- Storage is one SQLite file — back it up by copying it.
- HTTPS: for a real semester put the proxy behind campus HTTPS or a
  reverse proxy (Try Caddy). Plain HTTP is fine for the second-computer smoke test.
- Keep the repo on the proxy host up to date with your fork — the relay
  reuses `dlc/llm/client.py` (same request shaping, timeouts, and
  reasoning-model handling as the tool itself).
