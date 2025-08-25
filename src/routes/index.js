import { Router } from 'express';
import pricing from './pricing.js';
import transactions from './transactions.js';
import analytics from './analytics.js';

const router = Router();

// Import route modules
router.use('/pricing', pricing);
router.use('/transactions', transactions);
router.use('/analytics', analytics);

// Info endpoint
router.get('/', (req, res) => {
  res.json({
    service: 'MCD-RCD API',
    version: '1.0.0',
    endpoints: [
      'GET /health',
      'GET /api/pricing/calculate',
      'POST /api/transactions',
      'POST /api/transactions/marketing',
      'GET /api/analytics'
    ]
  });
});

export default router;