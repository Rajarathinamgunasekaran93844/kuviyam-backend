const ApiError = require("../utils/ApiError");

const createRateLimiter = ({ windowMs, max, message = "Too many requests. Try again later." }) => {
  const buckets = new Map();
  let lastCleanup = 0;

  return (req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup >= windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastCleanup = now;
    }

    const key = req.ip || req.socket.remoteAddress || "unknown";
    if (buckets.size >= 50_000 && !buckets.has(key)) {
      buckets.delete(buckets.keys().next().value);
    }
    const bucket = buckets.get(key);
    const current = bucket && bucket.resetAt > now
      ? bucket
      : { count: 0, resetAt: now + windowMs };

    current.count += 1;
    buckets.set(key, current);

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - current.count)));
    res.set("RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));

    if (current.count > max) {
      return next(new ApiError(429, message));
    }

    return next();
  };
};

module.exports = createRateLimiter;
