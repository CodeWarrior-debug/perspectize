# Grafana dashboards and alert rules

Dashboards and alert rules for Perspectize, kept as code. They run locally in the
observability tracer stack and are later imported into Grafana Cloud. Runbook:
[.docs/OBSERVABILITY.md](../../.docs/OBSERVABILITY.md).

```
ops/grafana/
├── dashboards/perspectize-api.json      # API dashboard (datasource = $datasource variable)
├── alerts/perspectize-alerts.yaml       # Grafana-managed alert rules (file-provisioning format)
└── provisioning/dashboards.yaml         # local-only dashboard provider for otel-lgtm
```

These are **tracer drafts**. The plan (Task 14 Step 4) is for a human to import them,
adjust them in the Grafana UI, then export them back over these files. The JSON/YAML
in git is the source of truth.

## Local: how the provisioning is mounted

`docker-compose.observability.yml` runs `grafana/otel-lgtm:0.34.0`. Its Grafana runs
from `/otel-lgtm/grafana`, so the provisioning root is
`/otel-lgtm/grafana/conf/provisioning`. The image's own `datasources/` and
`dashboards/` providers live there too
([docker-otel-lgtm `docker/Dockerfile`](https://github.com/grafana/docker-otel-lgtm/blob/v0.34.0/docker/Dockerfile),
README section "Add custom dashboards"). The files are mounted read-only:

| Repo file | Container path |
|---|---|
| `provisioning/dashboards.yaml` | `/otel-lgtm/grafana/conf/provisioning/dashboards/perspectize.yaml` |
| `dashboards/` | `/otel-lgtm/grafana/conf/provisioning/dashboards/perspectize/` |
| `alerts/perspectize-alerts.yaml` | `/otel-lgtm/grafana/conf/provisioning/alerting/perspectize-alerts.yaml` |

Grafana reads provisioning only at startup. After editing a file, restart the container
with `docker compose -f docker-compose.demo.yml -f docker-compose.observability.yml restart lgtm`.
Dashboards show up in the **Perspectize** folder. The alert rule is under
Alerting → Alert rules → Perspectize → `perspectize-api`.

The datasource UIDs that otel-lgtm provisions (`docker/grafana-datasources.yaml`) are
`prometheus`, `tempo` and `loki`.

**Editing workflow:** `allowUiUpdates: true` lets you change the dashboard in the UI.
Save it, then export it as JSON with the "share externally / use in another instance"
option **off** (that option adds `__inputs`, which file provisioning doesn't accept).
Copy the JSON over `dashboards/perspectize-api.json` and restart `lgtm`. Provisioned alert rules
can't be edited in the UI. Change the YAML and restart instead.

## Grafana Cloud: importing later

### Dashboard

1. Dashboards → New → Import, then upload `dashboards/perspectize-api.json`.
2. At the top of the dashboard, set the **Prometheus** picker (the `$datasource`
   template variable) to the stack's Prometheus datasource. It's usually named
   `grafanacloud-<stack>-prom`. Every panel, the `$job`/`$operation` variables and the
   "Deploys" annotation follow that variable, so nothing else needs changing.
3. Save. To make that datasource the saved default, save with "Save current variable
   values as dashboard default" ticked.

The queries filter on `job`, not `service_name`. Prometheus's OTLP translation sets
`job` from `service.name` (`service.namespace/service.name` when a namespace is set),
and Grafana Cloud does the same. So the same PromQL works in both places. If Cloud
reports a different `job` value, the `$job` picker's regex `/perspectize-backend/`
still matches it.

### Alert rule

Provisioned alert rules can't use dashboard template variables. The YAML hard-codes
`datasourceUid: prometheus` (the local uid). Grafana Cloud has no filesystem
provisioning, so use one of these options:

- **UI (simplest, matches the plan's import-then-export flow):**
  1. Alerting → Alert rules → New alert rule. Paste query A's PromQL from the YAML and
     pick the Cloud Prometheus datasource.
  2. Add reduce B (Last, "Drop non-numeric values") and threshold C (`> 1`). Set
     pending period 10m, no-data → OK, and folder/group `Perspectize` / `perspectize-api`.
  3. Then More → Export → YAML, and commit the export over `alerts/perspectize-alerts.yaml`.
- **Provisioning HTTP API:** replace `datasourceUid: prometheus` with the Cloud uid.
  Find it under Connections → Data sources → the Prometheus datasource, where it's the
  last URL segment. Then `POST /api/v1/provisioning/alert-rules` with a service-account
  token (Editor). The rule body takes the same fields as a rule in the YAML
  (`uid`, `title`, `condition`, `data`, `for`, `noDataState`, `execErrState`, `labels`,
  `annotations`), plus `folderUID` and `ruleGroup`.

Before the rule can notify anyone, set a contact point (Manual step M6 in the plan).
