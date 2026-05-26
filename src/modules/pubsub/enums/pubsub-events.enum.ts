export enum PubSubEvent {
  // Events flowing through the META_WEBHOOKS topic
  META_WEBHOOK_RECEIVED = 'meta.webhook.received',

  // Events flowing through the IDENTITY_WORKFLOWS topic
  INSTAGRAM_OTP_RECEIVED = 'instagram.otp.received',
  USER_SIGNUP_COMPLETED = 'user.signup.completed',
  IDENTITY_CLAIMED = 'identity.claimed',

  // Events flowing through the NOTIFICATIONS topic
  NOTIFICATION_SEND_REQUESTED = 'notification.send_requested',
  OTP_SMS_SENT = 'otp.sms.sent',
}
