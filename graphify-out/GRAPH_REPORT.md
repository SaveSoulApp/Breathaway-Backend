# Graph Report - /Users/mohitmalpani/Business/BreathAway/Backend/breathaway  (2026-06-03)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 961 nodes · 2095 edges · 58 communities (44 shown, 14 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0efd5dc4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Email Adapters|Email Adapters]]
- [[_COMMUNITY_Auth and Swagger Config|Auth and Swagger Config]]
- [[_COMMUNITY_Firebase Auth Service|Firebase Auth Service]]
- [[_COMMUNITY_PubSub Message Handlers|PubSub Message Handlers]]
- [[_COMMUNITY_Device Management|Device Management]]
- [[_COMMUNITY_Identity Management|Identity Management]]
- [[_COMMUNITY_Project Dependencies|Project Dependencies]]
- [[_COMMUNITY_User Relations Service|User Relations Service]]
- [[_COMMUNITY_Encryption Utilities|Encryption Utilities]]
- [[_COMMUNITY_Credits and Ledger|Credits and Ledger]]
- [[_COMMUNITY_Development Environment Variables|Development Environment Variables]]
- [[_COMMUNITY_Logging and Guards|Logging and Guards]]
- [[_COMMUNITY_Development Dependencies|Development Dependencies]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Profile Management|Profile Management]]
- [[_COMMUNITY_NPM Scripts|NPM Scripts]]
- [[_COMMUNITY_Service Testing Mocks|Service Testing Mocks]]
- [[_COMMUNITY_Production Environment Variables|Production Environment Variables]]
- [[_COMMUNITY_Reporting Data Transfer Objects|Reporting Data Transfer Objects]]
- [[_COMMUNITY_Likes Management|Likes Management]]
- [[_COMMUNITY_Social Interaction Controllers|Social Interaction Controllers]]
- [[_COMMUNITY_Decorator Unit Tests|Decorator Unit Tests]]
- [[_COMMUNITY_Social Identity Verification|Social Identity Verification]]
- [[_COMMUNITY_Admin Reporting Service|Admin Reporting Service]]
- [[_COMMUNITY_PubSub Ingestion Registry|PubSub Ingestion Registry]]
- [[_COMMUNITY_Currency Formatting Utilities|Currency Formatting Utilities]]
- [[_COMMUNITY_Serialization Interceptors|Serialization Interceptors]]
- [[_COMMUNITY_Jest Test Configuration|Jest Test Configuration]]
- [[_COMMUNITY_Enum Validation Pipes|Enum Validation Pipes]]
- [[_COMMUNITY_Deployment Scripts|Deployment Scripts]]
- [[_COMMUNITY_Infrastructure and CI Workflows|Infrastructure and CI Workflows]]
- [[_COMMUNITY_NestJS CLI Configuration|NestJS CLI Configuration]]
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_E2E Test Configuration|E2E Test Configuration]]
- [[_COMMUNITY_Block Controller|Block Controller]]
- [[_COMMUNITY_Path Mapping Configuration|Path Mapping Configuration]]
- [[_COMMUNITY_Request ID Decorator|Request ID Decorator]]
- [[_COMMUNITY_Client Identity Decorator|Client Identity Decorator]]
- [[_COMMUNITY_Match Controller|Match Controller]]
- [[_COMMUNITY_OTP Verification DTOs|OTP Verification DTOs]]
- [[_COMMUNITY_Timezone Validation Decorator|Timezone Validation Decorator]]
- [[_COMMUNITY_Workload Identity Federation Script|Workload Identity Federation Script]]
- [[_COMMUNITY_User ID Decorator|User ID Decorator]]
- [[_COMMUNITY_Cloud Run Cleanup|Cloud Run Cleanup]]
- [[_COMMUNITY_TypeScript Build Config|TypeScript Build Config]]
- [[_COMMUNITY_Graphify Rules|Graphify Rules]]

## God Nodes (most connected - your core abstractions)
1. `DateUtil` - 34 edges
2. `scripts` - 26 edges
3. `compilerOptions` - 24 edges
4. `Firebase Service` - 24 edges
5. `IdentityService` - 23 edges
6. `BlockService` - 17 edges
7. `MatchService` - 16 edges
8. `DeviceService` - 15 edges
9. `IdentityController` - 14 edges
10. `ProfileService` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Cleanup Cloud Run Revisions` --conceptually_related_to--> `NestJS Framework`  [INFERRED]
  .github/workflows/cleanup-cloud-run.yaml → README.md
- `CI Tests Workflow` --conceptually_related_to--> `Postgres Service`  [INFERRED]
  .github/workflows/tests.yaml → docker-compose.yml
- `Common Middleware Tests Documentation` --conceptually_related_to--> `CI Tests Workflow`  [INFERRED]
  src/common/tests/middlewares/README.md → .github/workflows/tests.yaml
- `Common Pipes Tests Documentation` --conceptually_related_to--> `CI Tests Workflow`  [INFERRED]
  src/common/tests/pipes/README.md → .github/workflows/tests.yaml
- `Firebase Module Tests Documentation` --references--> `Firebase Service`  [EXTRACTED]
  src/modules/firebase/test/README.md → src/modules/firebase/firebase.service.ts

## Import Cycles
- None detected.

## Communities (58 total, 14 thin omitted)

### Community 0 - "Email Adapters"
Cohesion: 0.07
Nodes (12): EmailPayload, IEmailAdapter, SendEmailOptions, EMAIL_TEMPLATE_MAP, EmailTemplateConfig, EmailType, LikeSummary, NOTIFICATION_TYPE_TO_EMAIL_TYPE (+4 more)

### Community 1 - "Auth and Swagger Config"
Cohesion: 0.08
Nodes (19): JwtAuthModule, BlockModule, applySwaggerBasicAuth(), adminApiDocumentation(), publicApiDocumentation(), setupSwagger(), REDOC_SUBPATH, SWAGGER_ADMIN_PATH (+11 more)

### Community 2 - "Firebase Auth Service"
Cohesion: 0.08
Nodes (12): FirebaseValidationResult, Firebase Service, Firebase Module Tests Documentation, AuthSigninDto, AuthSignupDto, DevLoginDto, SocialAuthType, UserAuthDto (+4 more)

### Community 3 - "PubSub Message Handlers"
Cohesion: 0.09
Nodes (12): PubSubEvent, PubSubTopic, WebhookMessageHandler, MetaWebhookResult, ParsedInstagramMessage, MetaMessageDto, MetaMessagingEventDto, MetaParticipantDto (+4 more)

### Community 4 - "Device Management"
Cohesion: 0.10
Nodes (9): DeviceController, DeviceService, ClientIdentityKey, Platform, UserAgentData, CreateDeviceDto, PatchDeviceDto, UpdateDeviceDto (+1 more)

### Community 5 - "Identity Management"
Cohesion: 0.11
Nodes (11): IdentityController, IdentityService, mockCreateIdentityDto, mockEncryptedData, mockIdentityCompleteResponse, mockIdentityData, mockIdentityResponse, mockLookupIdentityDto (+3 more)

### Community 6 - "Project Dependencies"
Cohesion: 0.05
Nodes (41): dependencies, axios, cache-manager, cache-manager-redis-yet, class-transformer, class-validator, cross-env, dayjs (+33 more)

### Community 7 - "User Relations Service"
Cohesion: 0.08
Nodes (3): BlockService, RedisHealthIndicator, MatchService

### Community 8 - "Encryption Utilities"
Cohesion: 0.11
Nodes (9): encryptAesGcm(), generateDataKey(), EncryptedValue, PlatformId, PublicValue, CloudKmsKeyManager, IKeyManager, keyManagerProvider (+1 more)

### Community 9 - "Credits and Ledger"
Cohesion: 0.11
Nodes (3): PaginationMeta, CreditStatusFilter, SortOrder

### Community 10 - "Development Environment Variables"
Cohesion: 0.06
Nodes (30): APP_NAME, BREVO_API_KEY, DEPLOYMENT_ENV, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME, EMAIL_PROVIDER, FIREBASE_PROJECT_ID, GCP_BUCKET_NAME (+22 more)

### Community 12 - "Development Dependencies"
Cohesion: 0.07
Nodes (29): devDependencies, eslint, eslint-config-prettier, @eslint/eslintrc, @eslint/js, eslint-plugin-prettier, globals, jest-mock-extended (+21 more)

### Community 13 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (28): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+20 more)

### Community 14 - "Profile Management"
Cohesion: 0.12
Nodes (5): ProfileController, ProfileService, CreateProfileDto, PatchProfileDto, UpdateProfileDto

### Community 15 - "NPM Scripts"
Cohesion: 0.08
Nodes (26): scripts, build, deploy:dev, deploy:prod, format, generate:dev, generate:prod, lint (+18 more)

### Community 16 - "Service Testing Mocks"
Cohesion: 0.24
Nodes (7): BlockWithProfile, MatchWithUsers, createPrismaMock(), MockPrismaService, CreateBlockDto, DateUtil, formatDate()

### Community 17 - "Production Environment Variables"
Cohesion: 0.08
Nodes (23): APP_NAME, DEPLOYMENT_ENV, FIREBASE_PROJECT_ID, GCP_BUCKET_NAME, GCP_PROJECT_ID, IMAGE_BASE_URL, JWT_AUDIENCE, JWT_EXPIRES_IN (+15 more)

### Community 18 - "Reporting Data Transfer Objects"
Cohesion: 0.09
Nodes (22): BlocksReportDto, CreditsGivenSplitDto, DemographicsDto, IdentitySplitDto, IntentSplitDto, IntentStatsDto, PlatformSplitDto, TimeframeCreditsGivenDto (+14 more)

### Community 19 - "Likes Management"
Cohesion: 0.14
Nodes (4): LikeController, LikeService, TargetIdentityInputDto, LikeTargetIdentityDto

### Community 20 - "Social Interaction Controllers"
Cohesion: 0.20
Nodes (4): CurrentUserId, SerializeExpose(), BlockedUserDto, MatchOtherUserDto

### Community 22 - "Decorator Unit Tests"
Cohesion: 0.24
Nodes (5): MockRequest, TestDto, TestDto, createMockCallHandler(), createMockExecutionContext()

### Community 27 - "Currency Formatting Utilities"
Cohesion: 0.33
Nodes (3): amountToWords(), formatCurrency(), formatINR()

### Community 28 - "Serialization Interceptors"
Cohesion: 0.22
Nodes (3): ClassConstructor, SerializeExclude(), ClassConstructor

### Community 29 - "Jest Test Configuration"
Cohesion: 0.22
Nodes (9): jest, collectCoverageFrom, coverageDirectory, moduleFileExtensions, rootDir, testEnvironment, testRegex, transform (+1 more)

### Community 30 - "Enum Validation Pipes"
Cohesion: 0.25
Nodes (3): NumericEnum, Priority, TestStatus

### Community 31 - "Deployment Scripts"
Cohesion: 0.61
Nodes (7): build_image(), deploy_service(), main(), print_error(), print_status(), print_success(), deploy.sh script

### Community 33 - "Infrastructure and CI Workflows"
Cohesion: 0.29
Nodes (7): Postgres Service, Common Middleware Tests Documentation, Common Pipes Tests Documentation, NestJS Framework, Cleanup Cloud Run Revisions, Create Module Workflow, CI Tests Workflow

### Community 34 - "NestJS CLI Configuration"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, assets, deleteOutDir, $schema, sourceRoot

### Community 35 - "Package Metadata"
Cohesion: 0.29
Nodes (6): author, description, license, name, private, version

### Community 36 - "E2E Test Configuration"
Cohesion: 0.29
Nodes (6): moduleFileExtensions, rootDir, testEnvironment, testRegex, transform, ^.+\\.(t|j)s$

### Community 38 - "Path Mapping Configuration"
Cohesion: 0.33
Nodes (6): moduleNameMapper, ^@common/(.*)$, ^@core/(.*)$, ^@infrastructure/(.*)$, ^@modules/(.*)$, ^src/(.*)$

### Community 45 - "Workload Identity Federation Script"
Cohesion: 0.50
Nodes (3): POOL_ID, PROVIDER_ID, setup-wif.sh script

## Knowledge Gaps
- **262 isolated node(s):** `$schema`, `collection`, `sourceRoot`, `deleteOutDir`, `assets` (+257 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DateUtil` connect `Service Testing Mocks` to `Email Adapters`, `Firebase Auth Service`, `PubSub Message Handlers`, `Device Management`, `Identity Management`, `User Relations Service`, `Credits and Ledger`, `Logging and Guards`, `Profile Management`, `Likes Management`, `Timezone Utilities`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `IdentityService` connect `Identity Management` to `Email Adapters`, `PubSub Message Handlers`, `User Relations Service`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `Firebase Service` connect `Firebase Auth Service` to `Email Adapters`, `Auth and Swagger Config`, `Logging and Guards`, `Profile Management`, `Service Testing Mocks`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `$schema`, `collection`, `sourceRoot` to the rest of the system?**
  _264 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Email Adapters` be split into smaller, more focused modules?**
  _Cohesion score 0.07319347319347319 - nodes in this community are weakly interconnected._
- **Should `Auth and Swagger Config` be split into smaller, more focused modules?**
  _Cohesion score 0.07616892911010557 - nodes in this community are weakly interconnected._
- **Should `Firebase Auth Service` be split into smaller, more focused modules?**
  _Cohesion score 0.07568027210884354 - nodes in this community are weakly interconnected._