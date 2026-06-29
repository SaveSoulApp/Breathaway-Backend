# Mocking Strategy
- Always use `jest.mock()` or NestJS testing module's `.overrideProvider()`.
- Do not hit the real database in unit tests. Use a mocked instance of `PrismaService`.
- Use `deepMock` from `jest-mock-extended` for complex Prisma clients if needed.
