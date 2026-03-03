# Vantage

Vantage is a trust-first local discovery app. It ranks nearby businesses using verified activity, credibility-weighted reviews, and recency instead of relying only on static star ratings.

### Backend

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Known Limitations

- The app still depends on Google Places data quality for some imported listings.
- Some fallback/demo flows are tuned for Toronto and should be parameterized more cleanly.
- There is duplicated frontend helper logic in a few page components (`getBusinessId`, image candidate shaping).
- There is not yet a full automated test suite; current verification is mostly smoke checks plus type/syntax checks.

## Next Steps

- Consolidate repeated frontend view helpers into shared utilities.
- Add route-level backend tests for ranking, auth guards, and saved/check-in flows.
- Add stronger moderation tooling for fake reviews and coordinated engagement.
- Separate demo-only operational scripts from production deployment docs more aggressively.
