/**
 * Tests for branded type composition and interaction
 *
 * Validates brand accumulation and type safety across different branded types.
 */

import { describe, expect, test } from '@effect/vitest'

import { ServiceCallId } from './service-call-id.schema.ts'
import { TenantId } from './tenant-id.schema.ts'

describe('Brand accumulation', () => {
	test('TenantId has both UUID7 and TenantId brands', () => {
		const validUuid7 = '01932b9e-1234-7abc-9def-0123456789ab'
		const tenantId = TenantId.make(validUuid7)

		// The value should be branded with both UUID7 and TenantId
		// This is structural - we can't directly test the brand at runtime,
		// but TypeScript enforces it at compile time
		expect(typeof tenantId).toBe('string')
		expect(tenantId).toBe(validUuid7 as TenantId.Type)
	})

	test('Different entity ID types are not interchangeable', () => {
		const validUuid7 = '01932b9e-1234-7abc-9def-0123456789ab'
		const tenantId = TenantId.make(validUuid7)
		const serviceCallId = ServiceCallId.make(validUuid7)

		// Even though they have the same value, TypeScript should prevent mixing them
		// @ts-expect-error - TenantId.Type should not be assignable to ServiceCallId.Type
		const _wrongAssignment: ServiceCallId.Type = tenantId

		// Runtime values are the same (both are strings)
		expect(tenantId as string).toBe(serviceCallId as string)
	})
})
