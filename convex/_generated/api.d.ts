/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as channelRules from "../channelRules.js";
import type * as devices from "../devices.js";
import type * as families from "../families.js";
import type * as http from "../http.js";
import type * as resolveChannel from "../resolveChannel.js";
import type * as settings from "../settings.js";
import type * as watchSessions from "../watchSessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  channelRules: typeof channelRules;
  devices: typeof devices;
  families: typeof families;
  http: typeof http;
  resolveChannel: typeof resolveChannel;
  settings: typeof settings;
  watchSessions: typeof watchSessions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
