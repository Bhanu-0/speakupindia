const express  = require('express');
const router   = express.Router();
const Issue    = require('../models/Issue');
const { Vote, Comment, Notification } = require('../models/index');
const {
  authenticate,
  optionalAuth,
  citizenOrAbove,
  officialOrAbove,
  moderatorOrAbove,
} = require('../middleware/auth');

// ─── POST / — Create issue ────────────────────────────────────────────────────

router.post('/', authenticate, citizenOrAbove, async (req, res) => {
  try {
    const {
      title, description, category, location,
      tags, is_anonymous, media_urls,
    } = req.body;

    if (!title || !description || !category || !location?.coordinates) {
      return res.status(400).json({ error: 'title, description, category, and location are required' });
    }

    const issue = await Issue.create({
      reporter_id:  req.user.id,
      title:        title.trim(),
      description:  description.trim(),
      category,
      location:     {
        type:        'Point',
        coordinates: location.coordinates, // [lng, lat]
        address:     location.address,
        district:    location.district,
        state:       location.state,
        pincode:     location.pincode,
      },
      tags:         tags?.map(t => t.toLowerCase().trim()) || [],
      is_anonymous: is_anonymous ?? false,
      media_urls:   media_urls || [],
    });

    // Trigger async AI categorization (fire-and-forget)
    triggerAICategorization(issue._id).catch(console.error);

    res.status(201).json({ issue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

// ─── GET / — Feed ─────────────────────────────────────────────────────────────

router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      category, district, state, status,
      page = 1, limit = 20, sort = 'recent',
    } = req.query;

    const filter = { is_hidden: false };
    if (category) filter.category = category;
    if (district) filter['location.district'] = district;
    if (state)    filter['location.state'] = state;
    if (status)   filter.status = status;

    const sortMap = {
      recent:  { createdAt: -1 },
      popular: { upvote_count: -1, createdAt: -1 },
      trending:{ trending_score: -1 },
    };

    const issues = await Issue.find(filter)
      .sort(sortMap[sort] || sortMap.recent)
      .skip((page - 1) * Math.min(limit, 50))
      .limit(Math.min(Number(limit), 50))
      .populate('reporter_id', 'full_name avatar_url is_verified')
      .populate('assigned_official', 'full_name department is_official_verified')
      .lean();

    const total = await Issue.countDocuments(filter);

    res.json({
      issues,
      pagination: {
        page:  Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// ─── GET /trending ────────────────────────────────────────────────────────────

router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const { district, state, limit = 10 } = req.query;

    const filter = { is_trending: true, is_hidden: false };
    if (district) filter['location.district'] = district;
    if (state)    filter['location.state'] = state;

    const issues = await Issue.find(filter)
      .sort({ trending_score: -1 })
      .limit(Math.min(Number(limit), 20))
      .populate('reporter_id', 'full_name is_verified')
      .lean();

    res.json({ issues });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trending issues' });
  }
});

// ─── GET /nearby — Geo query ──────────────────────────────────────────────────

router.get('/nearby', optionalAuth, async (req, res) => {
  try {
    const { lat, lng, radius = 5, limit = 20 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query params are required' });
    }

    const radiusInMeters = Math.min(Number(radius), 50) * 1000;

    const issues = await Issue.find({
      is_hidden: false,
      location: {
        $geoWithin: {
          $centerSphere: [
            [parseFloat(lng), parseFloat(lat)],
            radiusInMeters / 6378100, // Earth radius in meters
          ],
        },
      },
    })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 50))
      .lean();

    res.json({ issues, radius_km: Number(radius) });
  } catch (err) {
    res.status(500).json({ error: 'Geo query failed' });
  }
});

// ─── GET /:id — Issue detail ──────────────────────────────────────────────────

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id)
      .populate('reporter_id', 'full_name avatar_url is_verified reputation_score')
      .populate('assigned_official', 'full_name department is_official_verified avatar_url');

    if (!issue || issue.is_hidden) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    // Attach user's vote if logged in
    let userVote = null;
    if (req.user) {
      const vote = await Vote.findOne({ issue_id: issue._id, voter_id: req.user.id });
      userVote = vote?.vote_type || null;
    }

    res.json({ issue, user_vote: userVote });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// ─── PATCH /:id/status — Official/Moderator update ───────────────────────────

router.patch('/:id/status', authenticate, officialOrAbove, async (req, res) => {
  try {
    const { status, note } = req.body;
    const allowed = ['in_review', 'action_taken', 'resolved', 'rejected'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const update = {
      status,
      assigned_official: req.user.id,
    };
    if (status === 'resolved') update.resolved_at = new Date();

    const issue = await Issue.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    // Notify the reporter
    if (!issue.is_anonymous) {
      await Notification.create({
        user_id:  issue.reporter_id,
        issue_id: issue._id,
        type:     'issue_status_update',
        title:    `Your issue status updated to: ${status}`,
        message:  note || '',
      });
    }

    res.json({ issue });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ─── POST /:id/vote ───────────────────────────────────────────────────────────

router.post('/:id/vote', authenticate, citizenOrAbove, async (req, res) => {
  try {
    const { vote_type } = req.body;
    if (!['up', 'down'].includes(vote_type)) {
      return res.status(400).json({ error: 'vote_type must be "up" or "down"' });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const existing = await Vote.findOne({
      issue_id: issue._id,
      voter_id: req.user.id,
    });

    let delta = { upvote_count: 0, downvote_count: 0 };

    if (existing) {
      if (existing.vote_type === vote_type) {
        // Toggle off (remove vote)
        await existing.deleteOne();
        delta[vote_type === 'up' ? 'upvote_count' : 'downvote_count'] = -1;
      } else {
        // Switch vote direction
        const old = existing.vote_type;
        existing.vote_type = vote_type;
        await existing.save();
        delta[vote_type === 'up' ? 'upvote_count' : 'downvote_count'] = 1;
        delta[old === 'up'        ? 'upvote_count' : 'downvote_count'] = -1;
      }
    } else {
      await Vote.create({ issue_id: issue._id, voter_id: req.user.id, vote_type });
      delta[vote_type === 'up' ? 'upvote_count' : 'downvote_count'] = 1;
    }

    const updated = await Issue.findByIdAndUpdate(
      issue._id,
      { $inc: delta },
      { new: true, select: 'upvote_count downvote_count' }
    );

    res.json({
      upvote_count:   updated.upvote_count,
      downvote_count: updated.downvote_count,
      user_vote:      existing?.vote_type === vote_type ? null : vote_type,
    });
  } catch (err) {
    res.status(500).json({ error: 'Vote failed' });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const isOwner = issue.reporter_id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own issues' });
    }

    await issue.deleteOne();
    res.json({ message: 'Issue deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── Async AI categorization call ────────────────────────────────────────────

async function triggerAICategorization(issueId) {
  // Calls the Python FastAPI microservice
  const res = await fetch(`${process.env.AI_SERVICE_URL}/categorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issue_id: issueId }),
  });
  if (!res.ok) throw new Error('AI service error');
}

module.exports = router;
