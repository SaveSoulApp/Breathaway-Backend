export const DSAR_EXPORT_COMPLETED_EVENT = 'dsar.export.completed';

/**
 * Domain event dispatched when an asynchronous DSAR data export has been
 * successfully assembled, encrypted, and uploaded to Cloud Storage.
 */
export class DsarExportCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly exportId: string,
    public readonly expiresAt: Date,
  ) {}
}
