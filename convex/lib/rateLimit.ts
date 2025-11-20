import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

const RATE_LIMIT_WINDOW_MS = 1000; // 1 second

/**
 * Check if the user has exceeded the rate limit (1 request per second)
 * Throws an error if rate limit is exceeded
 */
export async function checkRateLimit(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const now = Date.now();

  // Get the user's last request time
  const rateLimitRecord = await ctx.db
    .query("rateLimits")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (rateLimitRecord) {
    const timeSinceLastRequest = now - rateLimitRecord.lastRequestTime;

    if (timeSinceLastRequest < RATE_LIMIT_WINDOW_MS) {
      throw new Error("Too many requests. Please try again in a second.");
    }

    // Update the last request time
    await ctx.db.patch(rateLimitRecord._id, {
      lastRequestTime: now,
    });
  } else {
    // First request from this user, create a record
    await ctx.db.insert("rateLimits", {
      userId,
      lastRequestTime: now,
    });
  }
}
