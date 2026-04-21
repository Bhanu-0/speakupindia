const mongoose = require('mongoose');

// ─── Comment ────────────────────────────────────────────────────────────────

const commentSchema = new mongoose.Schema(
  {
    issue_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },

    content: { type: String, required: true, trim: true, maxlength: 1000 },

    // Official response gets a verification badge and is pinned in feed
    is_official_response: { type: Boolean, default: false },
    is_pinned:            { type: Boolean, default: false },

    upvote_count: { type: Number, default: 0 },

    is_hidden: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

commentSchema.index({ issue_id: 1, createdAt: 1 });
commentSchema.index({ issue_id: 1, is_official_response: -1 }); // Official replies first

// ─── Rating ─────────────────────────────────────────────────────────────────

const ratingSchema = new mongoose.Schema(
  {
    issue_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    rater_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    official_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },

    // 1–5 stars on three dimensions
    response_speed:      { type: Number, min: 1, max: 5, required: true },
    resolution_quality:  { type: Number, min: 1, max: 5, required: true },
    overall_score:       { type: Number, min: 1, max: 5, required: true },

    feedback_text: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

// One rating per user per issue
ratingSchema.index({ issue_id: 1, rater_id: 1 }, { unique: true });
ratingSchema.index({ official_id: 1, createdAt: -1 });

// ─── Vote ────────────────────────────────────────────────────────────────────

const voteSchema = new mongoose.Schema(
  {
    issue_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    voter_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    vote_type:{ type: String, enum: ['up', 'down'], required: true },
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

// One vote per user per issue (upserted on toggle)
voteSchema.index({ issue_id: 1, voter_id: 1 }, { unique: true });

// ─── ModerationFlag ──────────────────────────────────────────────────────────

const moderationFlagSchema = new mongoose.Schema(
  {
    issue_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    flagged_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },

    reason: {
      type: String,
      enum: ['spam', 'fake', 'hate_speech', 'misinformation', 'duplicate', 'other'],
      required: true,
    },
    details: { type: String, trim: true, maxlength: 500 },

    // Moderation outcome
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'escalated'],
      default: 'pending',
    },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: Date,
    moderator_note: String,

    // AI pre-screening scores
    ai_verdict:    String,
    ai_spam_score: { type: Number, min: 0, max: 1 },
    ai_hate_score: { type: Number, min: 0, max: 1 },
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

moderationFlagSchema.index({ status: 1, ai_spam_score: -1 }); // Priority queue order
moderationFlagSchema.index({ issue_id: 1 });

// ─── Notification ─────────────────────────────────────────────────────────────

const notificationSchema = new mongoose.Schema(
  {
    user_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    issue_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue' },

    type: {
      type: String,
      enum: [
        'issue_status_update',
        'official_response',
        'upvote_milestone',
        'issue_resolved',
        'comment_reply',
        'moderation_decision',
      ],
      required: true,
    },
    title:   { type: String, required: true },
    message: String,
    is_read: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

notificationSchema.index({ user_id: 1, is_read: 1, createdAt: -1 });

module.exports = {
  Comment:         mongoose.model('Comment',         commentSchema),
  Rating:          mongoose.model('Rating',          ratingSchema),
  Vote:            mongoose.model('Vote',            voteSchema),
  ModerationFlag:  mongoose.model('ModerationFlag',  moderationFlagSchema),
  Notification:    mongoose.model('Notification',    notificationSchema),
};
