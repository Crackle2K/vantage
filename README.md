# Vantage
A location-based platform connecting users with local businesses.

## Project Overview

Vantage helps users discover nearby local businesses and helps businesses grow using analytics and deals.

**Tech Stack:**
- **Frontend**: React + TypeScript (Vite)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB Atlas
- **Authentication**: JWT with HTTP-only cookies

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB (local or Atlas)

### Backend Setup

```bash
cd backend
python -m pip install -r requirements.txt
python init_db.py  # Initialize database indexes
uvicorn main:app --reload
```

Backend runs on `http://localhost:8000`

### Frontend Setup

```bash
cd frontend
npm install
npm install react-router-dom
npm run dev
```

Frontend runs on `http://localhost:5173`

## Features

### For Customers
- Location-based business discovery
- Customizable search radius (5km, 10km, 25km, 50km)
- Filter by category
- Leave ratings and reviews
- Save favorites
- View exclusive deals

### For Business Owners
- Create business account
- Manage business profile
- Add deals/coupons
- View analytics dashboard (views, ratings, reviews)

## API Documentation

API docs available at `http://localhost:8000/docs` when backend is running.

### Key Endpoints
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `GET /api/businesses/nearby` - Find nearby businesses
- `POST /api/reviews` - Submit review
- `POST /api/deals` - Create deal

## Environment Setup

Create `backend/.env`:
```env
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=vantage
SECRET_KEY=your-secret-key-here
```

## Project Structure

```
backend/
├── database/       # MongoDB connection
├── models/         # Data models (User, Business, Review, Deal)
├── routes/         # API endpoints
├── services/       # Business logic
└── main.py         # FastAPI app

frontend/
├── src/
│   ├── components/ # React components
│   ├── pages/      # Page components (Home, Businesses, Login, Register)
│   └── lib/        # Utilities
└── package.json
```

## Development Status

 **Completed:**
- FastAPI backend with all routes
- MongoDB integration with Motor
- JWT authentication
- Geospatial business search
- User registration/login
- Review system with duplicate prevention
- Deal management
- Business CRUD operations
- Landing page
- Business listing page
- Login/Register pages
- Business cards with ratings

 **Next Steps:**
1. Start MongoDB service
2. Test end-to-end functionality
3. Deploy to production

## Troubleshooting

**MongoDB Connection Failed:**
- Ensure MongoDB is running
- Check connection string in `.env`

**CORS Errors:**
- Backend configured for ports 5173, 3000, 5174

**Geospatial Queries Fail:**
- Run `python init_db.py` to create indexes

## License

MIT
