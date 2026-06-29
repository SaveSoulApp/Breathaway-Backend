# Cloud Run Deployment
- **Statelessness:** Applications must not write to the local filesystem for persistent data.
- **Startup Time:** Optimize NestJS startup time; use lazy loading where appropriate.
- **Port Binding:** Listen on the port specified by the `PORT` environment variable (default 8080).
