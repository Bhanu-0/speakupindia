const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  type:        { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true }, // [lng, lat]
  address:     String,
  district:    String,
  state:       String,
  pincode:     String,
});

const issueSchema = new mongoose.Schema(
  {
    reporter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Content
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    media_urls:  [String], // S3 URLs: images, videos, documents
    tags:        [{ type: String, trim: true, lowercase: true }],

    // Categorization
    category: {
      type: String,
      enum: [
        'roads',
        'power',
        'water',
        'sanitation',
        'police',
        'corruption',
        'education',
        'health',
        'environment',
        'other',
      ],
      required: true,
    },

    // Status workflow
    status: {
      type: String,
      enum: ['pending', 'in_review', 'action_taken', 'resolved', 'rejected'],
      default: 'pending',
    },

    // Geo
    location: {
      type: locationSchema,
      required: true,
    },

    // Engagement counters (denormalized for feed performance)
    upvote_count:   { type: Number, default: 0 },
    downvote_count: { type: Number, default: 0 },
    comment_count:  { type: Number, default: 0 },

    // Privacy
    is_anonymous: { type: Boolean, default: false },

    // Official assignment
    assigned_official: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    official_response_at: Date,
    resolved_at:          Date,

    // AI fields (populated by Python microservice)
    ai_category_suggestion: String,
    ai_confidence_score:    { type: Number, min: 0, max: 1 },
    sentiment:              { type: String, enum: ['positive', 'neutral', 'negative', 'urgent'] },
    ai_spam_score:          { type: Number, min: 0, max: 1, default: 0 },

    // Trending engine
    is_trending:   { type: Boolean, default: false },
    trending_score:{ type: Number, default: 0 }, // Computed by cron job

    // Moderation
    is_flagged:    { type: Boolean, default: false },
    is_hidden:     { type: Boolean, default: false }, // Hidden by moderator
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (doc, ret) => {
        // Hide reporter identity if anonymous
        if (ret.is_anonymous) delete ret.reporter_id;
        delete ret.ai_spam_score;
        return ret;
      },
    },
  }
);

// 2dsphere index for geo-queries (/issues/nearby)
issueSchema.index({ location: '2dsphere' });

// Compound indexes for feed queries
issueSchema.index({ category: 1, status: 1, createdAt: -1 });
issueSchema.index({ 'location.district': 1, category: 1, createdAt: -1 });
issueSchema.index({ is_trending: 1, trending_score: -1 });
issueSchema.index({ assigned_official: 1, status: 1 });
issueSchema.index({ reporter_id: 1, createdAt: -1 });

// Text search index
issueSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Virtual: net vote score
issueSchema.virtual('vote_score').get(function () {
  return this.upvote_count - this.downvote_count;
});

// Virtual: response time in hours (if responded)
issueSchema.virtual('response_time_hours').get(function () {
  if (!this.official_response_at) return null;
  const diff = this.official_response_at - this.createdAt;
  return Math.round(diff / (1000 * 60 * 60));
});

module.exports = mongoose.model('Issue', issueSchema);
