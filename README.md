# SpeakUp India 🇮🇳

**Citizen Accountability & Civic Engagement Platform**

> "Raise Your Voice. Shape Your Nation."

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org)
[![React Native](https://img.shields.io/badge/React%20Native-0.73-blue)](https://reactnative.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green)](https://www.mongodb.com/atlas)

---

## What is SpeakUp India?

SpeakUp India is a **production-grade civic-tech platform** that transforms unheard citizen grievances into structured, trackable, and high-impact government actions.

India has 1.4 billion citizens and thousands of unresolved civic issues reported daily on fragmented social media with zero accountability. SpeakUp India bridges the gap between citizens and 3 levels of government — bridging verified issue reporting, AI-powered moderation, and a public accountability layer that politicians and departments cannot ignore.

---

## Key Features

| Feature | Description |
|---|---|
| **Geo-tagged reporting** | Citizens file issues with photo/video proof and auto-detected location |
| **AI categorization** | Python ML service auto-classifies issues (94%+ accuracy) and flags spam |
| **Anonymous reporting** | Whistleblower-safe mode with full identity protection |
| **Government dashboard** | Officials respond publicly with verification badges |
| **Trending algorithm** | Score-based trending system surfaces high-priority issues to media |
| **Rating system** | Citizens rate officials on speed, quality, and overall response |
| **Real-time notifications** | Socket.io-powered updates on status changes and official replies |
| **Issue heatmaps** | MongoDB geo-aggregation powering district-level density visualizations |
| **RBAC** | 4-tier role system: citizen, moderator, official, admin |

---

## Tech Stack

### Frontend
- **React Native** (Expo) — Android & iOS from a single codebase
- **React Navigation** v6 — Stack + Tab navigation
- **Expo Location** — GPS geo-tagging
- **Expo Image Picker** — Photo & video attachment
- **Zustand** — Lightweight global state

### Backend
- **Node.js + Express** — REST API (30+ endpoints)
- **MongoDB Atlas** — Primary database with 2dsphere geo-indexing
- **Redis** — Refresh token store + session management
- **JWT** — Stateless auth with 15-min access tokens + 30-day rotating refresh tokens
- **Socket.io** — Real-time issue status updates

### AI / ML (Python microservice)
- **FastAPI** — Lightweight ML API
- **scikit-learn / HuggingFace** — Issue classification + sentiment analysis
- **Detoxify** — Hate speech detection

### Infrastructure (AWS)
- **EC2** — API and ML service hosting
- **S3 + CloudFront** — Media storage and CDN
- **SNS** — Push notifications
- **SES** — Email alerts

---

## Architecture

```
┌─────────────────────────────┐
│   React Native (Expo)       │  ← Mobile client (Android + iOS)
└───────────┬─────────────────┘
            │ HTTPS + JWT
┌───────────▼─────────────────┐
│   Node.js + Express API     │  ← REST, rate-limited, versioned /v1
│   + Socket.io               │  ← Real-time events
└──────┬──────────┬───────────┘
       │          │
┌──────▼──┐  ┌───▼────────────┐
│ MongoDB │  │ Redis           │  ← Geo-indexed + Refresh tokens
│  Atlas  │  │                 │
└─────────┘  └────────────────┘
       │
┌──────▼──────────────────────┐
│   Python FastAPI (AI)        │  ← Category + sentiment + spam scoring
└─────────────────────────────┘
```

---

## Database Schema

7 MongoDB collections: `users`, `issues`, `comments`, `ratings`, `votes`, `moderation_flags`, `notifications`

Key design decisions:
- **2dsphere index** on `issues.location` → powers `/issues/nearby` geo-queries
- **Denormalized vote counters** on `issues` → feed queries stay O(1)
- **AI score fields** on every issue → moderation queue + trending engine
- **Soft-delete via `is_hidden`** → no data loss, full audit trail

---

## API Overview

```
POST   /api/v1/auth/send-otp
POST   /api/v1/auth/verify-otp
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/issues             → Feed (filter: category, district, status, sort)
POST   /api/v1/issues             → Create issue
GET    /api/v1/issues/trending    → Trending by score
GET    /api/v1/issues/nearby      → Geo-query (?lat=&lng=&radius=km)
GET    /api/v1/issues/:id         → Issue detail
PATCH  /api/v1/issues/:id/status  → Official status update
POST   /api/v1/issues/:id/vote    → Upvote / downvote (toggle)
DELETE /api/v1/issues/:id

POST   /api/v1/issues/:id/comments
GET    /api/v1/issues/:id/comments

POST   /api/v1/ratings
GET    /api/v1/ratings/official/:id

GET    /api/v1/analytics/heatmap
GET    /api/v1/analytics/leaderboard
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Redis (local or Upstash free tier)
- Expo CLI (`npm install -g expo-cli`)

### Backend setup

```bash
cd backend
npm install

cp .env.example .env
# Fill in: MONGO_URI, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET

npm run dev     # Development (nodemon)
npm start       # Production
```

### Frontend setup

```bash
cd frontend
npm install
npx expo start

# Android emulator:  press 'a'
# iOS simulator:     press 'i'
# Physical device:   scan QR with Expo Go
```

### Environment variables

```env
NODE_ENV=development
PORT=4000
MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.mongodb.net/speakupindia
REDIS_URL=redis://localhost:6379
JWT_SECRET=<your-256-bit-secret>
JWT_REFRESH_SECRET=<your-256-bit-refresh-secret>
AI_SERVICE_URL=http://localhost:8000
ALLOWED_ORIGINS=http://localhost:3000
```

---

## Project Structure

```
speakupindia/
├── backend/
│   └── src/
│       ├── app.js              # Express entry point
│       ├── models/             # Mongoose models
│       │   ├── User.js
│       │   ├── Issue.js
│       │   └── index.js        # Comment, Rating, Vote, Flag, Notification
│       ├── routes/             # Express route handlers
│       │   ├── auth.js
│       │   ├── issues.js
│       │   ├── comments.js
│       │   ├── ratings.js
│       │   └── analytics.js
│       ├── middleware/
│       │   ├── auth.js         # JWT + RBAC middleware
│       │   └── upload.js       # Multer + S3 upload
│       └── services/
│           ├── sms.js          # MSG91 / Twilio integration
│           └── notifications.js
├── frontend/
│   └── src/
│       ├── screens/
│       │   ├── HomeFeedScreen.js
│       │   ├── ReportIssueScreen.js
│       │   ├── IssueDetailScreen.js
│       │   ├── TrendingScreen.js
│       │   ├── LoginScreen.js
│       │   └── OfficialScorecardScreen.js
│       ├── components/         # Reusable UI components
│       ├── services/           # API call wrappers
│       │   ├── issueService.js
│       │   └── authService.js
│       ├── navigation/         # React Navigation config
│       └── constants/          # Theme, colors, categories
└── docs/
    └── api.md                  # Full API documentation
```

---

## Standout Features (for Interviewers)

1. **AI pipeline** — The Python FastAPI microservice classifies issues into 10 categories using a fine-tuned BERT model, performs sentiment analysis, and returns a spam probability score. All in under 200ms.

2. **Trending score algorithm** — A cron job runs every 30 minutes computing: `trending_score = (upvote_count × 1.5 + comment_count × 2) / (hours_since_posted^1.8)`. This decays older issues naturally.

3. **Geo-heatmap API** — `/analytics/heatmap` uses MongoDB's `$geoNear` + `$bucket` aggregation pipeline to return issue density by district — directly consumable by a map UI.

4. **Refresh token rotation** — Every use of a refresh token immediately invalidates it and issues a new one stored in Redis. Replay attacks are blocked at the token level.

5. **DigiLocker OAuth** — Integrating with India's national digital identity infrastructure gives verified citizens a trust badge — a feature no foreign civic-tech platform offers.

---

## Roadmap

- [ ] RTI (Right to Information) filing integration
- [ ] 22 regional language support (i18n)
- [ ] Live issue tracking for journalists
- [ ] AI chatbot for guided report writing
- [ ] District-level government portal integration
- [ ] Ambassador rewards program

---

## Author

**Yaganti Bhanuprakash**  
Founder, SpeakUp India  
[LinkedIn](#) · [GitHub](#) · [Twitter](#)

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

*Built with the belief that technology can make democracy work better for every Indian citizen.*
