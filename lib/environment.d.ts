import type { RuntimeContext, TurnEnvironment } from './types.js';
export declare function resolveEnvironment(ctx: RuntimeContext, sessionId: string, networkAccess: boolean): TurnEnvironment;
export declare function renderEnvironment(environment: TurnEnvironment): string;
export declare function metadataSandbox(mode: TurnEnvironment['sandboxMode']): string;
