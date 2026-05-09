/**
 * Deqah Runtime Orchestration System
 *
 * Core modules:
 * - launch/readiness  - Pre-launch validation
 * - audit/detector    - Error detection in critical flows
 *
 * Usage:
 *   import { runLaunchReadiness, runErrorDetection } from '@deqah/runtime';
 *
 *   // Run launch readiness check
 *   const readiness = await runLaunchReadiness();
 *
 *   // Run error detection
 *   const errors = await runErrorDetection('auth');
 */

export { runLaunchReadiness } from './launch/readiness';
export { runErrorDetection } from './audit/detector';
export type { FlowType } from './audit/detector';
