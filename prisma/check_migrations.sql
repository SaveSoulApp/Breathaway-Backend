SELECT migration_name, finished_at, applied_steps_count
FROM "_prisma_migrations"
ORDER BY finished_at DESC
LIMIT 10;
