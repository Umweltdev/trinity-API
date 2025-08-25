# MCD-RCD API
A RESTful API for pricing calculations, transaction processing, and business analytics.

🚀 Quick Start
bash
## Install dependencies
npm install

## Set up environment
cp .env.example .env

## Start development server
npm run dev
📋 API Endpoints
Core Endpoints
GET /health - API status check

GET /api - API information

Pricing
GET /api/pricing/calculate?basePrice=100&email=user@example.com - Calculate discounted prices

GET /api/pricing/customer/:email/discount - Get customer discounts

Transactions
POST /api/transactions - Record customer transactions

POST /api/transactions/marketing - Record marketing spends

Analytics
GET /api/analytics - Business analytics dashboard

GET /api/analytics/customer/:email - Customer-specific analytics

🔧 Environment Setup
Create .env file:

env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/mcd-rcd
NODE_ENV=development
📦 Scripts
bash
npm start          # Production start
npm run dev        # Development with hot reload
npm test           # Run tests
🎯 Example Usage
bash
## Calculate price
curl "http://localhost:3001/api/pricing/calculate?basePrice=100"

## Check health
curl http://localhost:3001/health
📁 Project Structure
text
src/
├── config/        # Database configuration
├── models/        # Data models
├── routes/        # API routes
└── server.js      # Express server