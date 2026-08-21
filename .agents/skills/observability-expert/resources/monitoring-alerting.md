# Monitoring, Alerting & SLOs

Reference for Cloud Monitoring dashboards, log-based metrics, alerting policies, uptime checks,
and SLO definitions — defined as Terraform resources, consistent with this project's
infrastructure-as-code conventions from `devops-gcp-expert`.

---

## 1. Baseline: What Cloud Run Already Gives You

Before adding custom instrumentation, know what's automatic. Cloud Run emits, with no app code
changes required:

- Request count, request latency (p50/p95/p99), by status code
- Container instance count (active, idle)
- CPU and memory utilization per instance
- Billable container instance time

Don't duplicate these with custom metrics. Build dashboards and alerts against these built-in
metrics first; only add custom/log-based metrics for things Cloud Run's infra-level view can't
express (business events, domain-specific failure modes).

---

## 2. Log-Based Metrics (Preferred Over Custom Metric API Calls)

Log-based metrics extract a metric from structured log fields already being emitted — no
separate instrumentation call needed in application code beyond the logging already done per
`pino-logging.md`.

### Example: counting business events from structured logs

```hcl
resource "google_logging_metric" "orders_created" {
  name   = "orders_created"
  filter = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="api-production"
    jsonPayload.message="Order created"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}
```

### Example: counting a specific error pattern

```hcl
resource "google_logging_metric" "prisma_connection_errors" {
  name   = "prisma_connection_errors"
  filter = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="api-production"
    severity="ERROR"
    jsonPayload.err.message=~"Can't reach database server"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}
```

This is exactly why `pino-logging.md`'s structured metadata discipline matters beyond
readability — well-structured log fields are what make log-based metrics possible at all
without separate instrumentation.

### Distribution metrics (e.g., job processing duration)

```hcl
resource "google_logging_metric" "job_processing_duration" {
  name   = "job_processing_duration_ms"
  filter = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.message="Job completed"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "ms"
  }
  value_extractor = "EXTRACT(jsonPayload.durationMs)"
}
```

---

## 3. Custom Metrics API (Only When Log-Based Isn't Sufficient)

Reach for direct custom metric writes only for high-frequency gauges that don't map naturally
to discrete log events (e.g., an in-process queue depth sampled periodically):

```typescript
import { MetricServiceClient } from '@google-cloud/monitoring';

// Generally wrap this behind an interface per the clean-architecture-expert DIP rule —
// don't inject MetricServiceClient directly into use cases.
async function recordQueueDepth(depth: number) {
  const client = new MetricServiceClient();
  await client.createTimeSeries({
    name: client.projectPath(projectId),
    timeSeries: [
      {
        metric: { type: 'custom.googleapis.com/queue_depth' },
        resource: { type: 'global', labels: { project_id: projectId } },
        points: [
          {
            interval: { endTime: { seconds: Date.now() / 1000 } },
            value: { int64Value: depth },
          },
        ],
      },
    ],
  });
}
```

Prefer log-based metrics whenever the signal can be expressed as "this happened, with these
fields" — reserve the direct API for genuine continuous gauges.

---

## 4. Alerting Policies (Terraform)

### Error rate

```hcl
resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "API error rate above threshold"
  combiner      = "OR"

  conditions {
    display_name = "5xx rate > 5% over 5 min"
    condition_threshold {
      filter          = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name="api-production"
        metric.type="run.googleapis.com/request_count"
        metric.labels.response_code_class="5xx"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05
      duration        = "300s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.engineering_alerts.id]
}
```

### Latency

```hcl
resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "API p99 latency above threshold"
  combiner      = "OR"

  conditions {
    display_name = "p99 latency > 2s over 5 min"
    condition_threshold {
      filter          = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name="api-production"
        metric.type="run.googleapis.com/request_latencies"
      EOT
      comparison      = "COMPARISON_GT"
      threshold_value = 2000
      duration        = "300s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.engineering_alerts.id]
}
```

### `/ready` failures (DB connectivity degradation)

```hcl
resource "google_monitoring_alert_policy" "readiness_failures" {
  display_name = "Readiness probe failures (DB connectivity)"
  combiner      = "OR"

  conditions {
    display_name = "Uptime check failure on /ready"
    condition_threshold {
      filter          = "resource.type=\"uptime_url\" AND metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "180s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.engineering_alerts.id]
}
```

### Instance count pinned at max (scaling ceiling hit)

```hcl
resource "google_monitoring_alert_policy" "max_instances_hit" {
  display_name = "Cloud Run instance count at configured max"
  combiner      = "OR"

  conditions {
    display_name = "Instance count >= max_instances for 10 min"
    condition_threshold {
      filter          = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name="api-production"
        metric.type="run.googleapis.com/container/instance_count"
      EOT
      comparison      = "COMPARISON_GTE"
      threshold_value = 20   # match this service's max_instance_count from terraform-standards.md
      duration        = "600s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.engineering_alerts.id]
}
```

This alert matters specifically because of the connection-pool exhaustion risk flagged in
`prisma-optimizer` and `devops-gcp-expert` — hitting max instances under sustained load means
the service is at its configured ceiling for both compute _and_ Cloud SQL connection budget,
worth proactive attention before it becomes an outage.

### Notification channel

```hcl
resource "google_monitoring_notification_channel" "engineering_alerts" {
  display_name = "Engineering Alerts"
  type         = "email"   # or "slack", "pagerduty" depending on your on-call tooling
  labels = {
    email_address = "engineering-alerts@yourcompany.com"
  }
}
```

---

## 5. Uptime Checks

Independent of Cloud Run's own container-level health probing (which only tells you a given
container instance is healthy) — an uptime check confirms the service is reachable end-to-end
from outside GCP's internal network, catching DNS, load balancer, or regional issues that
container-level probes can't see.

```hcl
resource "google_monitoring_uptime_check_config" "api_health" {
  display_name = "API /health uptime check"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(module.api_service.uri, "https://")
    }
  }
}
```

---

## 6. Dashboards

Build a Cloud Monitoring dashboard combining: request rate/latency/error rate (built-in Cloud
Run metrics), instance count vs configured max, and the log-based business metrics defined in
section 2. Define via Terraform (`google_monitoring_dashboard`) so the dashboard config is
version-controlled rather than hand-built in the console and unrecoverable if accidentally
modified.

```hcl
resource "google_monitoring_dashboard" "api_overview" {
  dashboard_json = file("${path.module}/dashboards/api-overview.json")
}
```

Export an existing console-built dashboard's JSON definition as a starting point
(`gcloud monitoring dashboards list` / `describe`), then commit it and manage further changes
through Terraform rather than the console, to avoid drift between what's deployed and what's
documented.

---

## 7. SLOs (Starter Definition)

Define a basic availability and latency SLO once the service has stable production traffic,
using Cloud Monitoring's SLO framework (built on the same metrics as the alerting policies
above):

```hcl
resource "google_monitoring_slo" "api_availability" {
  service      = google_monitoring_service.api.service_id
  display_name = "API Availability"

  goal                = 0.999   # 99.9% — adjust to actual business requirement, don't default to 99.99% without justification
  rolling_period_days = 30

  request_based_sli {
    good_total_ratio {
      good_service_filter  = "metric.labels.response_code_class != \"5xx\""
      total_service_filter = "metric.type=\"run.googleapis.com/request_count\""
    }
  }
}
```

**Rule:** Set the SLO target to match actual business requirements and current baseline
performance, not an arbitrary "five nines" aspiration — an SLO that's already being missed on
day one provides no useful signal and trains the team to ignore alerts.

---

## 8. Review Checklist

- [ ] Dashboards and alerting policies defined via Terraform, not hand-built in console
- [ ] Alerting policies exist for: error rate, latency (p95/p99), `/ready` uptime check failures,
      instance count at configured max
- [ ] Uptime check on `/health` exists independent of Cloud Run's container-level probing
- [ ] Log-based metrics used for business events instead of separate custom-metric instrumentation,
      wherever the event is already logged
- [ ] Notification channel(s) actually reach the team that owns on-call response — verify, don't assume
- [ ] SLO targets (if defined) are grounded in actual business requirements and current baseline,
      not an arbitrary default
