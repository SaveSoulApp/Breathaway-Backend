import { ConsentChannel, ConsentSource } from '@prisma/client';

import { buildInitialConsentRecords } from './consent.utils';

describe('consent.utils', () => {
  describe('buildInitialConsentRecords', () => {
    it('should generate 4 channel records with SIGNUP source and true consent', () => {
      const records = buildInitialConsentRecords();

      expect(records).toHaveLength(4);

      const channels = records.map((r) => r.channel);
      expect(channels).toEqual([
        ConsentChannel.PUSH,
        ConsentChannel.EMAIL,
        ConsentChannel.SMS,
        ConsentChannel.WHATSAPP,
      ]);

      for (const record of records) {
        expect(record.consentGranted).toBe(true);
        expect(record.source).toBe(ConsentSource.SIGNUP);
        expect(record.ipAddress).toBeUndefined();
        expect(record.userAgent).toBeUndefined();
      }
    });

    it('should include ipAddress and userAgent when provided', () => {
      const records = buildInitialConsentRecords({
        ipAddress: '192.168.1.100',
        userAgent: 'BreathAway-iOS/1.0',
      });

      expect(records).toHaveLength(4);
      for (const record of records) {
        expect(record.consentGranted).toBe(true);
        expect(record.source).toBe(ConsentSource.SIGNUP);
        expect(record.ipAddress).toBe('192.168.1.100');
        expect(record.userAgent).toBe('BreathAway-iOS/1.0');
      }
    });
  });
});
