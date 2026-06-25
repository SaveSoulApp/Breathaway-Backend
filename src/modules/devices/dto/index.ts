/**
 * Barrel export for all devices module Data Transfer Objects (DTOs).
 *
 * Provides a single entry point for importing request and response DTOs
 * within the devices bounded context.
 */

export * from './request/create-device.request.dto';
export * from './request/patch-device.request.dto';
export * from './request/update-device.request.dto';
export * from './response/device.response.dto';
