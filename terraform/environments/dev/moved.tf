# moved.tf
#
# Declarative state migrations for the Development environment.
# Seamlessly moves existing resources from root into module.backend with ZERO destruction.

moved {
  from = google_artifact_registry_repository.breathaway_backend_nestjs_repo
  to   = module.backend.google_artifact_registry_repository.breathaway_backend_nestjs_repo
}

moved {
  from = google_bigquery_dataset.audit_logs_dataset
  to   = module.backend.google_bigquery_dataset.audit_logs_dataset
}

moved {
  from = google_bigquery_table.audit_logs_events
  to   = module.backend.google_bigquery_table.audit_logs_events
}

moved {
  from = google_cloud_run_v2_service_iam_member.pubsub_invoker_run_binding
  to   = module.backend.google_cloud_run_v2_service_iam_member.pubsub_invoker_run_binding
}

moved {
  from = google_cloud_run_v2_service_iam_member.scheduler_invoker_binding
  to   = module.backend.google_cloud_run_v2_service_iam_member.scheduler_invoker_binding
}

moved {
  from = google_cloud_run_v2_service_iam_member.scheduler_maintenance_invoker_binding
  to   = module.backend.google_cloud_run_v2_service_iam_member.scheduler_maintenance_invoker_binding
}

moved {
  from = google_cloud_scheduler_job.expire_credit_bundles_job
  to   = module.backend.google_cloud_scheduler_job.expire_credit_bundles_job
}

moved {
  from = google_cloud_scheduler_job.purge_expired_user_sessions_job
  to   = module.backend.google_cloud_scheduler_job.purge_expired_user_sessions_job
}

moved {
  from = google_cloud_scheduler_job.reconcile_payments_job
  to   = module.backend.google_cloud_scheduler_job.reconcile_payments_job
}

moved {
  from = google_cloud_scheduler_job.rotate_instagram_token_job
  to   = module.backend.google_cloud_scheduler_job.rotate_instagram_token_job
}

moved {
  from = google_cloud_scheduler_job.warn_expiring_credit_bundles_job
  to   = module.backend.google_cloud_scheduler_job.warn_expiring_credit_bundles_job
}

moved {
  from = google_logging_linked_dataset.app_logs_bq_link
  to   = module.backend.google_logging_linked_dataset.app_logs_bq_link
}

moved {
  from = google_logging_project_bucket_config.app_logs_bucket
  to   = module.backend.google_logging_project_bucket_config.app_logs_bucket
}

moved {
  from = google_logging_project_sink.app_logs_sink
  to   = module.backend.google_logging_project_sink.app_logs_sink
}

moved {
  from = google_project_iam_member.backend_service_bigquery_job_user
  to   = module.backend.google_project_iam_member.backend_service_bigquery_job_user
}

moved {
  from = google_project_iam_member.backend_service_bigquery_viewer
  to   = module.backend.google_project_iam_member.backend_service_bigquery_viewer
}

moved {
  from = google_project_iam_member.backend_service_browser
  to   = module.backend.google_project_iam_member.backend_service_browser
}

moved {
  from = google_project_iam_member.backend_service_cloudsql
  to   = module.backend.google_project_iam_member.backend_service_cloudsql
}

moved {
  from = google_project_iam_member.backend_service_kms_encrypter_decrypter
  to   = module.backend.google_project_iam_member.backend_service_kms_encrypter_decrypter
}

moved {
  from = google_project_iam_member.backend_service_pubsub_publisher
  to   = module.backend.google_project_iam_member.backend_service_pubsub_publisher
}

moved {
  from = google_project_iam_member.maintenance_runner_cloudsql
  to   = module.backend.google_project_iam_member.maintenance_runner_cloudsql
}

moved {
  from = google_project_iam_member.maintenance_runner_secrets_accessor
  to   = module.backend.google_project_iam_member.maintenance_runner_secrets_accessor
}

moved {
  from = google_project_iam_member.pubsub_bq_writer
  to   = module.backend.google_project_iam_member.pubsub_bq_writer
}

moved {
  from = google_pubsub_subscription.audit_logs_bq_sub
  to   = module.backend.google_pubsub_subscription.audit_logs_bq_sub
}

moved {
  from = google_pubsub_subscription.push_subscriptions
  to   = module.backend.google_pubsub_subscription.push_subscriptions
}

moved {
  from = google_pubsub_topic.audit_logs_topic
  to   = module.backend.google_pubsub_topic.audit_logs_topic
}

moved {
  from = google_pubsub_topic.dsar_export
  to   = module.backend.google_pubsub_topic.dsar_export
}

moved {
  from = google_secret_manager_secret_iam_member.backend_service_secrets_accessor
  to   = module.backend.google_secret_manager_secret_iam_member.backend_service_secrets_accessor
}

moved {
  from = google_secret_manager_secret_iam_member.maintenance_runner_instagram_accessor
  to   = module.backend.google_secret_manager_secret_iam_member.maintenance_runner_instagram_accessor
}

moved {
  from = google_secret_manager_secret_iam_member.maintenance_runner_instagram_adder
  to   = module.backend.google_secret_manager_secret_iam_member.maintenance_runner_instagram_adder
}

moved {
  from = google_service_account.backend_service
  to   = module.backend.google_service_account.backend_service
}

moved {
  from = google_service_account.maintenance_runner
  to   = module.backend.google_service_account.maintenance_runner
}

moved {
  from = google_service_account.pubsub_invoker
  to   = module.backend.google_service_account.pubsub_invoker
}

moved {
  from = google_service_account.scheduler_invoker
  to   = module.backend.google_service_account.scheduler_invoker
}

moved {
  from = google_service_account_iam_member.backend_service_token_creator
  to   = module.backend.google_service_account_iam_member.backend_service_token_creator
}

moved {
  from = google_service_account_iam_member.pubsub_token_creator
  to   = module.backend.google_service_account_iam_member.pubsub_token_creator
}

moved {
  from = google_storage_bucket.dsar_exports
  to   = module.backend.google_storage_bucket.dsar_exports
}

moved {
  from = google_storage_bucket_iam_member.backend_service_dsar_storage
  to   = module.backend.google_storage_bucket_iam_member.backend_service_dsar_storage
}
