---
description: Creates a new module given by command
---

**Objective:** Scaffold a new NestJS module using strict enterprise architecture constraints.

**Input Variable Extraction:**
Identify the target `moduleName` from the user's prompt. Format it to kebab-case if it is not already.

**Execution Steps:**
You must execute the following actions sequentially. Do not deviate from this directory structure. All paths assume execution from the project root.

1. **Execute Nest CLI Commands:**
   Run the following terminal commands to generate the boilerplate. This ensures the module, controller, and service are automatically wired together in the NestJS dependency injection container.
   - `nest g module modules/{{moduleName}}`
   - `nest g controller modules/{{moduleName}} --no-spec`
   - `nest g service modules/{{moduleName}} --no-spec`

2. **Create DTO & Entity Architecture:**
   Execute terminal commands to create the strict folder structure for data transfer and domain isolation inside the newly created module:
   - `mkdir -p src/modules/{{moduleName}}/dto/request`
   - `mkdir -p src/modules/{{moduleName}}/dto/response`
   - `mkdir -p src/modules/{{moduleName}}/entities`
   - `touch src/modules/{{moduleName}}/dto/index.ts`

3. **Initialize Barrel File:**
   Write the following template code into `src/modules/{{moduleName}}/dto/index.ts` to prepare it for clean imports:
   `// Export Request DTOs`
   `// export * from './request/create-{{moduleName}}.request.dto';`

   `// Export Response DTOs`
   `// export * from './response/{{moduleName}}.response.dto';`

4. **Completion Notification:**
   Output a brief success message to the user confirming that the `{{moduleName}}` module has been successfully scaffolded according to the system's architectural standards.
