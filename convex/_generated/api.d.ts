/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiTracking from "../aiTracking.js";
import type * as auth from "../auth.js";
import type * as backfillTokens from "../backfillTokens.js";
import type * as bugReports from "../bugReports.js";
import type * as canvasCards from "../canvasCards.js";
import type * as canvasConnections from "../canvasConnections.js";
import type * as canvases from "../canvases.js";
import type * as clearAllData from "../clearAllData.js";
import type * as conversations from "../conversations.js";
import type * as featureRequests from "../featureRequests.js";
import type * as gemini from "../gemini.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as messageFiles from "../messageFiles.js";
import type * as messages from "../messages.js";
import type * as openai from "../openai.js";
import type * as projectFiles from "../projectFiles.js";
import type * as projects from "../projects.js";
import type * as responseFeedback from "../responseFeedback.js";
import type * as testResponses from "../testResponses.js";
import type * as tests from "../tests.js";
import type * as users from "../users.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiTracking: typeof aiTracking;
  auth: typeof auth;
  backfillTokens: typeof backfillTokens;
  bugReports: typeof bugReports;
  canvasCards: typeof canvasCards;
  canvasConnections: typeof canvasConnections;
  canvases: typeof canvases;
  clearAllData: typeof clearAllData;
  conversations: typeof conversations;
  featureRequests: typeof featureRequests;
  gemini: typeof gemini;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/rateLimit": typeof lib_rateLimit;
  messageFiles: typeof messageFiles;
  messages: typeof messages;
  openai: typeof openai;
  projectFiles: typeof projectFiles;
  projects: typeof projects;
  responseFeedback: typeof responseFeedback;
  testResponses: typeof testResponses;
  tests: typeof tests;
  users: typeof users;
  waitlist: typeof waitlist;
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
