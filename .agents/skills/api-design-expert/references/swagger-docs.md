# Swagger Documentation & Decorators

### Controller Decorators (mandatory on every controller)
```typescript
@ApiTags('FeatureName')           // Always present, PascalCase, singular noun
@ApiBearerAuth()                  // On all authenticated controllers
@Controller({ path: 'resource', version: '1' })
```

### Endpoint Decorators
Every endpoint must have:
```typescript
@ApiOperation({ summary: '...', description: '...' })  // summary required, description recommended
@ApiResponse(...)                 // At minimum: success + 400 + 401 + 404 where applicable
```
