# Google Cloud MCP Plugin

This plugin configures Model Context Protocol (MCP) servers for Google Cloud Platform (GCP) within the project.

## Included MCP Servers

1. **`gcloud` (`@google-cloud/gcloud-mcp`)**
   - Natural language execution and querying of `gcloud` CLI commands (Cloud Run, Compute, IAM, etc.).
2. **`storage` (`@google-cloud/storage-mcp`)**
   - Querying, inspecting, and managing Google Cloud Storage (GCS) buckets and objects.
3. **`observability` (`@google-cloud/observability-mcp`)**
   - Accessing Google Cloud Observability APIs for Cloud Logging, Cloud Monitoring, and Cloud Trace.

## Prerequisites

- **Node.js**: v20 or higher.
- **Google Cloud SDK (`gcloud`)**: Installed and in your system PATH.
- **Authentication**: Authenticate using Application Default Credentials (ADC) or the `gcloud` CLI:
  ```bash
  gcloud auth login
  gcloud auth application-default login
  gcloud config set project <PROJECT_ID>
  ```
