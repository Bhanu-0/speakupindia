const jwt = require('jsonwebtoken');
const { createClient } = require('redis');

// Redis client (singleton — initialized once in app.js)
let redisClient;

const getRedis = () => {
  if (!redisClient) throw new Error('Redis not initialized');
  return redisClient;
};

const initRedis = async () => {
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (err) => console.error('Redis error:', err));
  await redisClient.connect();
  return redisClient;
};

// ─── Token utilities ─────────────────────────────────────────────────────────

const signAccessToken = (user) =>
  jwt.sign(
    {
      sub:  user._id.toString(),
      role: user.role,
      district: user.district,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

const signRefreshToken = (userId) =>
  jwt.sign(
    { sub: userId.toString(), type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );

// Store refresh token in Redis (invalidation support)
const storeRefreshToken = async (userId, token) => {
  const key = `refresh:${userId}:${token}`;
  await getRedis().set(key, '1', { EX: 60 * 60 * 24 * 30 }); // 30 days
};

const invalidateRefreshToken = async (userId, token) => {
  await getRedis().del(`refresh:${userId}:${token}`);
};

const isRefreshTokenValid = async (userId, token) => {
  const val = await getRedis().get(`refresh:${userId}:${token}`);
  return val === '1';
};

// ─── Middleware: authenticate ─────────────────────────────────────────────────

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id:       payload.sub,
      role:     payload.role,
      district: payload.district,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── Middleware: authorize roles ──────────────────────────────────────────────

// Usage: authorize('moderator', 'admin')
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Access denied. Required roles: ${roles.join(', ')}`,
    });
  }
  next();
};

// Shorthand role guards
const citizenOrAbove = authorize('citizen', 'moderator', 'official', 'admin');
const moderatorOrAbove = authorize('moderator', 'admin');
const officialOrAbove = authorize('official', 'admin');
const adminOnly = authorize('admin');

// ─── Middleware: optional auth (for anonymous feeds) ─────────────────────────

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next(); // anonymous — fine

  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // Silently ignore invalid/expired tokens for optional auth
  }
  next();
};

module.exports = {
  initRedis,
  signAccessToken,
  signRefreshToken,
  storeRefreshToken,
  invalidateRefreshToken,
  isRefreshTokenValid,
  authenticate,
  authorize,
  citizenOrAbove,
  moderatorOrAbove,
  officialOrAbove,
  adminOnly,
  optionalAuth,
};
