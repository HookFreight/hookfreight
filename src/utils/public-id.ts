/**
 * @fileoverview Public ID generation utilities.
 *
 * Creates Stripe-style prefixed IDs for external API usage.
 *
 * @license Apache-2.0
 */

import { randomUUID } from "node:crypto";

/**
 * Generates a prefixed public ID.
 *
 * @param prefix - Prefix for the ID (e.g., "app_", "end_")
 * @returns Prefixed public ID string
 */
export function makePublicId(prefix: string): string {
  const normalizedPrefix = prefix.endsWith("_") ? prefix : `${prefix}_`;
  return `${normalizedPrefix}${randomUUID().replace(/-/g, "")}`;
}

export const makeAppId = (): string => makePublicId("app_");
export const makeEndpointId = (): string => makePublicId("end_");
export const makeEventId = (): string => makePublicId("evt_");
export const makeDeliveryId = (): string => makePublicId("dlv_");
