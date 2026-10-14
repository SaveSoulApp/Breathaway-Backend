/**
 * Barrel export file for the preferences module Data Transfer Objects (DTOs).
 *
 * Exposes the request and response shapes used by the PreferencesController and
 * PreferencesService to query, paginate, and update user notification preferences and consent history.
 */
export * from './request/consent-ledger-query.request.dto';
export * from './request/update-preferences.request.dto';
export * from './response/consent-ledger.response.dto';
export * from './response/paginated-consent-ledger.response.dto';
export * from './response/preferences.response.dto';
