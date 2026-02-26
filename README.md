

# Vantage

**Vantage** is a community-powered local business discovery platform that ranks businesses based on verified activity and trust signals rather than static reviews.

This repository contains the full-stack implementation, including:

- **Backend:** FastAPI
- **Frontend:** React Client

---

## Tech Stack

### Backend

- FastAPI
- MongoDB (Motor async driver)
- Google Places API (seed data)
- Python 3.10+

### Frontend

- React (TypeScript/JavaScript)
- Tailwind CSS (if applicable)
- Vite / Next.js (update if needed)

---

## Features

- Geospatial business search (radius-based)
- Google Places API seeding with caching
- MongoDB 2dsphere indexing
- Business claiming system
- Verified visit validation (Haversine distance check)
- Live Visibility Score ranking engine
- Dark & light mode support
- Real-time activity indicators

---

## Project Structure

```
vantage/
│
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models/
│   ├── routes/
│   │   ├── search.py
│   │   ├── claim.py
│   │   ├── visit.py
│   ├── services/
│   │   ├── google_places.py
│   │   ├── ranking.py
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   └── package.json
│
└── README.md
```

---

## Environment Variables

Create a `.env` file inside `backend/` with the following:

```env
MONGO_URI=your_mongodb_connection_string
GOOGLE_API_KEY=your_google_places_api_key
USE_GOOGLE_API=true
```

**Important:**
- Do not commit `.env` to version control.
- Restrict API key to Places API only.

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/vantage.git
cd vantage
```

### 2. Backend Setup

Create virtual environment:

```bash
python -m venv venv
```

Activate the virtual environment:

- **Mac/Linux:**  
  `source venv/bin/activate`
- **Windows:**  
  `venv\Scripts\activate`

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Run server:

```bash
uvicorn backend.main:app --reload
```

Backend runs at:  
`http://localhost:8000`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at:  
`http://localhost:5173` (or your configured port)

---

## Core Concepts

### Business Seeding

- Google Places API used for initial discovery
- Businesses are stored in MongoDB
- `place_id` is used as unique identifier
- Duplicate prevention enforced

### Geospatial Search

- MongoDB 2dsphere index on location field
- Radius-based queries
- Sorted by `live_visibility_score`

### Claiming a Business

- Businesses can be claimed by authenticated users
- Sets `is_claimed = true`
- Associates `owner_id`

### Verified Visits

- User submits their location
- Backend verifies the distance using the Haversine formula
- If within threshold: visit marked as verified, ranking recalculated

### Ranking Algorithm

Live Visibility Score (LVS):

```text
LVS = (0.35 × verified_visits)
    + (0.30 × credibility_weighted_reviews)
    + (0.20 × recency_factor)
    + (0.15 × engagement_rate)
```

Scores are normalized (0–100) for display.

---

## API Endpoints

- **Search Businesses:**  
  `GET /api/search?lat=...&lng=...&radius=...`

- **Claim Business:**  
  `POST /api/business/{id}/claim`

- **Submit Visit:**  
  `POST /api/business/{id}/visit`

---

## Cost & API Controls

- Google API calls cached in MongoDB
- Daily quota limits configured
- Budget alerts enabled
- External API calls can be disabled (`USE_GOOGLE_API=false`)

---

## Development Notes

- Seed data before demo for stability
- Ensure MongoDB 2dsphere index is created
- Verify API key restrictions are applied

---

## License

For educational and competition use.

---

If you need more customization or want to add badges and formatting, let me know!
