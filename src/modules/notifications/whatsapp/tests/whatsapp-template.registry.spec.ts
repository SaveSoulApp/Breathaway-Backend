import { NotificationType } from '@modules/notifications/enums/notification-type.enum';

import { WHATSAPP_TEMPLATE_MAP } from '../whatsapp-template.registry';

describe('WhatsAppTemplateRegistry', () => {
  describe('NEW_MATCH template', () => {
    const config = WHATSAPP_TEMPLATE_MAP[NotificationType.NEW_MATCH];

    it('should have correct template name and language', () => {
      expect(config).toBeDefined();
      expect(config?.template).toBe('breathaway_new_match_v2');
      expect(config?.language).toBe('en');
    });

    it('should default buttonUrlVariable to "matches" when omitted or empty', () => {
      const payload1 = config?.buildPayload?.({});
      expect(payload1?.buttonUrlVariable).toBe('matches');

      const payload2 = config?.buildPayload?.({ buttonUrlVariable: '   ' });
      expect(payload2?.buttonUrlVariable).toBe('matches');
    });

    it('should use trimmed custom buttonUrlVariable when provided', () => {
      const payload = config?.buildPayload?.({
        buttonUrlVariable: '  custom-match-path  ',
      });
      expect(payload?.buttonUrlVariable).toBe('custom-match-path');
    });
  });

  describe('WELCOME template', () => {
    const config = WHATSAPP_TEMPLATE_MAP[NotificationType.WELCOME];

    it('should define static welcome template with no dynamic payload builder', () => {
      expect(config).toBeDefined();
      expect(config?.template).toBe('breathaway_new_user_login');
      expect(config?.language).toBe('en');
      expect(config?.buildPayload).toBeUndefined();
    });
  });

  describe('LIKE_SENT template', () => {
    const config = WHATSAPP_TEMPLATE_MAP[NotificationType.LIKE_SENT];

    it('should have correct template name and language', () => {
      expect(config).toBeDefined();
      expect(config?.template).toBe('breathaway_like_sent');
      expect(config?.language).toBe('en');
    });

    it('should default buttonUrlVariable to "alerts" when omitted', () => {
      const payload = config?.buildPayload?.({});
      expect(payload?.buttonUrlVariable).toBe('alerts');
    });

    it('should preserve custom buttonUrlVariable when provided', () => {
      const payload = config?.buildPayload?.({
        buttonUrlVariable: 'custom-alert',
      });
      expect(payload?.buttonUrlVariable).toBe('custom-alert');
    });
  });

  describe('LIKE_RECEIVED template', () => {
    const config = WHATSAPP_TEMPLATE_MAP[NotificationType.LIKE_RECEIVED];

    it('should have correct template name and language', () => {
      expect(config).toBeDefined();
      expect(config?.template).toBe('breathaway_someone_liked_you_v2');
      expect(config?.language).toBe('en');
    });

    it('should fallback to "there" when name is omitted or empty', () => {
      const payload1 = config?.buildPayload?.({});
      expect(payload1?.variables).toEqual(['there']);

      const payload2 = config?.buildPayload?.({ name: '   ' });
      expect(payload2?.variables).toEqual(['there']);
    });

    it('should use trimmed name in variables array', () => {
      const payload = config?.buildPayload?.({ name: '  Priya  ' });
      expect(payload?.variables).toEqual(['Priya']);
    });

    it('should preserve pre-defined variables array', () => {
      const payload = config?.buildPayload?.({
        variables: ['CustomName', 'CustomParam'],
      });
      expect(payload?.variables).toEqual(['CustomName', 'CustomParam']);
    });

    it('should include buttonUrlVariable if provided and valid', () => {
      const payload = config?.buildPayload?.({
        name: 'Alex',
        buttonUrlVariable: '  view-profile  ',
      });
      expect(payload?.variables).toEqual(['Alex']);
      expect(payload?.buttonUrlVariable).toBe('view-profile');
    });

    it('should omit buttonUrlVariable when not provided', () => {
      const payload = config?.buildPayload?.({ name: 'Alex' });
      expect(payload?.buttonUrlVariable).toBeUndefined();
    });
  });
});
