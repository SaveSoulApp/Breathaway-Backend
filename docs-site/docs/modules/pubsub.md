---
sidebar_position: 23
---

# Pub/Sub Module

The `PubSubModule` manages asynchronous communications with **Google Cloud Pub/Sub**, supporting event-driven workflows.

---

## 📋 Purpose & Responsibilities

- **Event Publishing**: Provides a uniform interface to publish system events to specific GCP Pub/Sub topics.
- **Event Ingestion**: Exposes a webhook ingestion controller (`/ingest`) that receives push subscription events from GCP and triggers internal handlers.
- **Handler Registry**: Decouples incoming payloads by registering mapping handlers to route messages based on action metadata.

---

## 🛠 File & Class Definitions

### Controller
- **[PubSubIngestionController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/pubsub/pubsub-ingestion.controller.ts)**: Validates incoming push webhook calls and forwards payload structures to the registry dispatcher.
  - Route Prefix: `/api/v1/pubsub/ingest`
  - Secured using a GCP-specific authentication guard.

### Services
- **[PubSubPublisherService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/pubsub/pubsub-publisher.service.ts)**: Configures and manages the GCP Pub/Sub client connection to send message batches.
- **[PubSubRegistryService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/pubsub/pubsub-registry.service.ts)**: Registers event handler routines mapping webhook categories to services.
