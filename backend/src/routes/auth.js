const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const User    = require('../models/User');
const {
  signAccessToken,
  signRefreshToken,
  storeRefreshToken,
  invalidateRefreshToken,
  isRefreshTokenValid,
  authenticate,
} = require('../middleware/auth');

// OTP rate limit: max 3 sends per phone per 10 minutes
const otpRateLimiter = new Map(); // phone → { count, resetAt }

const checkOtpRate = (phone) => {
  const now = Date.now();
  const entry = otpRateLimiter.get(phone);
  if (!entry || now > entry.resetAt) {
    otpRateLimiter.set(phone, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
};

// ─── POST /auth/send-otp ─────────────────────────────────────────────────────

router.post('/send-otp', async (req, res) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number || !/^\+91[6-9]\d{9}$/.test(phone_number)) {
      return res.status(400).json({ error: 'Invalid Indian phone number. Format: +91XXXXXXXXXX' });
    }

    if (!checkOtpRate(phone_number)) {
      return res.status(429).json({ error: 'Too many OTP requests. Try again in 10 minutes.' });
    }

    // Generate 6-digit OTP
    const otp = process.env.NODE_ENV === 'development'
      ? '123456' // Fixed OTP for dev/testing
      : String(Math.floor(100000 + Math.random() * 900000));

    const otp_hash    = await bcrypt.hash(otp, 10);
    const otp_expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Upsert user record
    await User.findOneAndUpdate(
      { phone_number },
      { otp_hash, otp_expires_at: otp_expires, otp_attempts: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Send via SMS provider (MSG91 / Twilio)
    // await smsService.send(phone_number, `Your SpeakUpIndia OTP: ${otp}. Valid for 5 minutes.`);
    // In dev, just log it:
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] OTP for ${phone_number}: ${otp}`);
    }

    res.json({ message: 'OTP sent successfully', expires_in: 300 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────

router.post('/verify-otp', async (req, res) => {
  try {
    const { phone_number, otp } = req.body;

    if (!phone_number || !otp) {
      return res.status(400).json({ error: 'phone_number and otp are required' });
    }

    const user = await User.findOne({ phone_number }).select(
      '+otp_hash +otp_expires_at +otp_attempts'
    );

    if (!user) return res.status(404).json({ error: 'Phone number not found. Send OTP first.' });
    if (user.is_banned) return res.status(403).json({ error: 'Account suspended.' });

    // Max 5 failed attempts before lockout
    if (user.otp_attempts >= 5) {
      return res.status(429).json({ error: 'Too many failed attempts. Request a new OTP.' });
    }

    if (!user.otp_expires_at || user.otp_expires_at < new Date()) {
      return res.status(400).json({ error: 'OTP expired. Request a new one.' });
    }

    const isValid = await bcrypt.compare(otp, user.otp_hash);
    if (!isValid) {
      await User.findByIdAndUpdate(user._id, { $inc: { otp_attempts: 1 } });
      return res.status(401).json({
        error: 'Invalid OTP',
        attempts_left: 5 - (user.otp_attempts + 1),
      });
    }

    // Clear OTP, update last_active
    await User.findByIdAndUpdate(user._id, {
      $unset: { otp_hash: '', otp_expires_at: '' },
      otp_attempts: 0,
      last_active: new Date(),
    });

    // Issue tokens
    const accessToken  = signAccessToken(user);
    const refreshToken = signRefreshToken(user._id);
    await storeRefreshToken(user._id.toString(), refreshToken);

    res.json({
      access_token:  accessToken,
      refresh_token: refreshToken,
      token_type:    'Bearer',
      expires_in:    900, // 15 minutes
      user:          user.public_profile,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token is required' });

    const jwt = require('jsonwebtoken');
    let payload;
    try {
      payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

    const isValid = await isRefreshTokenValid(payload.sub, refresh_token);
    if (!isValid) return res.status(401).json({ error: 'Refresh token revoked' });

    // Rotate: invalidate old, issue new
    await invalidateRefreshToken(payload.sub, refresh_token);

    const user = await User.findById(payload.sub);
    if (!user || user.is_banned) return res.status(403).json({ error: 'Account not accessible' });

    const newAccess  = signAccessToken(user);
    const newRefresh = signRefreshToken(user._id);
    await storeRefreshToken(user._id.toString(), newRefresh);

    res.json({
      access_token:  newAccess,
      refresh_token: newRefresh,
      expires_in:    900,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      await invalidateRefreshToken(req.user.id, refresh_token);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;
