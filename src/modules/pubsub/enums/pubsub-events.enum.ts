export enum PubSubEvent {
  // Events flowing through the META_WEBHOOKS topic
  META_WEBHOOK_RECEIVED = 'meta.webhook.received',

  // Events flowing through the IDENTITY_WORKFLOWS topic
  INSTAGRAM_OTP_RECEIVED = 'instagram.otp.received',
  USER_SIGNUP_COMPLETED = 'user.signup.completed',

  // Events flowing through the NOTIFICATIONS topic
  OTP_SMS_SENT = 'otp.sms.sent',
}
