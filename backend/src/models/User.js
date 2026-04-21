const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    phone_number: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: [/^\+91[6-9]\d{9}$/, 'Invalid Indian phone number'],
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    full_name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    avatar_url: String,

    // 'citizen' | 'moderator' | 'official' | 'admin'
    role: {
      type: String,
      enum: ['citizen', 'moderator', 'official', 'admin'],
      default: 'citizen',
    },

    // Location context
    district: { type: String, trim: true },
    state:    { type: String, trim: true, default: 'Maharashtra' },

    // Verification flags
    is_verified:         { type: Boolean, default: false }, // DigiLocker verified
    is_official_verified:{ type: Boolean, default: false }, // Govt account verified by admin
    department:          { type: String, trim: true },       // For officials: "PWD Pune"

    // Privacy
    is_anonymous_default: { type: Boolean, default: false },

    // Gamification
    reputation_score: { type: Number, default: 0, min: 0 },
    issues_filed:     { type: Number, default: 0 },
    issues_resolved:  { type: Number, default: 0 },

    // Auth internals (never returned to client)
    otp_hash:       String,
    otp_expires_at: Date,
    otp_attempts:   { type: Number, default: 0 },
    refresh_tokens: [String], // hashed refresh tokens (max 5)

    last_active: Date,
    is_banned:   { type: Boolean, default: false },
    ban_reason:  String,
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true, versionKey: false },
  }
);

// Indexes
userSchema.index({ phone_number: 1 });
userSchema.index({ role: 1 });
userSchema.index({ district: 1, state: 1 });
userSchema.index({ reputation_score: -1 });
userSchema.index({ is_official_verified: 1, department: 1 });

// Strip sensitive fields when converting to JSON
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.otp_hash;
    delete ret.otp_expires_at;
    delete ret.otp_attempts;
    delete ret.refresh_tokens;
    delete ret.is_banned;
    delete ret.ban_reason;
    return ret;
  },
});

// Virtual: public profile (safe to expose in APIs)
userSchema.virtual('public_profile').get(function () {
  return {
    _id: this._id,
    full_name: this.full_name,
    avatar_url: this.avatar_url,
    role: this.role,
    is_verified: this.is_verified,
    is_official_verified: this.is_official_verified,
    department: this.department,
    district: this.district,
    reputation_score: this.reputation_score,
    issues_filed: this.issues_filed,
  };
});

module.exports = mongoose.model('User', userSchema);
