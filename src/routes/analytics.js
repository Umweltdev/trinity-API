import { Router } from 'express';
import { getDB } from '../config/database.js';

const router = Router();

/**
 * @swagger
 * /api/analytics/overview:
 *   get:
 *     summary: Get business analytics overview
 *     description: Returns comprehensive business analytics including revenue, customer metrics, and marketing performance
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, ytd]
 *         description: Time period for analytics
 *         example: 30d
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: string
 *                 dateRange:
 *                   type: object
 *                   properties:
 *                     start:
 *                       type: string
 *                       format: date-time
 *                     end:
 *                       type: string
 *                       format: date-time
 *                 revenue:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     transactions:
 *                       type: integer
 *                     averageOrderValue:
 *                       type: number
 *                 customers:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     new:
 *                       type: integer
 *                     growthRate:
 *                       type: number
 *                 marketing:
 *                   type: object
 *                   properties:
 *                     totalSpend:
 *                       type: number
 *                     campaigns:
 *                       type: integer
 *                     roi:
 *                       type: number
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Get basic business analytics
router.get('/overview', async (req, res) => {
  try {
    const db = getDB();
    const { period = '30d' } = req.query; // 7d, 30d, 90d, ytd
    
    // Calculate date range based on period
    const startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'ytd':
        startDate.setMonth(0, 1); // January 1st
        startDate.setHours(0, 0, 0, 0);
        break;
      default: // 30d
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get total revenue
    const revenueData = await db.collection('transactions')
      .aggregate([
        {
          $match: {
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            averageOrderValue: { $avg: '$amount' }
          }
        }
      ]).toArray();

    // Get customer metrics
    const customerData = await db.collection('customers')
      .aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            newCustomers: { $sum: 1 }
          }
        }
      ]).toArray();

    // Get total customers
    const totalCustomers = await db.collection('customers').countDocuments();

    // Get marketing spend
    const marketingData = await db.collection('marketingSpend')
      .aggregate([
        {
          $match: {
            date: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalSpend: { $sum: '$amount' },
            campaignCount: { $sum: 1 }
          }
        }
      ]).toArray();

    const revenue = revenueData[0] || { totalRevenue: 0, transactionCount: 0, averageOrderValue: 0 };
    const marketing = marketingData[0] || { totalSpend: 0, campaignCount: 0 };
    const newCustomers = customerData[0]?.newCustomers || 0;

    // Calculate ROI
    const roi = marketing.totalSpend > 0 
      ? ((revenue.totalRevenue - marketing.totalSpend) / marketing.totalSpend) * 100 
      : 0;

    res.json({
      period,
      dateRange: {
        start: startDate,
        end: new Date()
      },
      revenue: {
        total: Math.round(revenue.totalRevenue * 100) / 100,
        transactions: revenue.transactionCount,
        averageOrderValue: Math.round(revenue.averageOrderValue * 100) / 100
      },
      customers: {
        total: totalCustomers,
        new: newCustomers,
        growthRate: totalCustomers > 0 ? (newCustomers / totalCustomers) * 100 : 0
      },
      marketing: {
        totalSpend: Math.round(marketing.totalSpend * 100) / 100,
        campaigns: marketing.campaignCount,
        roi: Math.round(roi * 100) / 100
      },
      calculatedAt: new Date()
    });

  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics data',
      message: error.message 
    });
  }
});

/**
 * @swagger
 * /api/analytics/revenue-trends:
 *   get:
 *     summary: Get revenue trends over time
 *     description: Returns revenue trends grouped by day, week, or month
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *         description: Grouping interval for trends
 *         example: day
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *         description: Number of days to look back
 *         example: 30
 *     responses:
 *       200:
 *         description: Revenue trends retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: string
 *                 groupBy:
 *                   type: string
 *                 trends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       period:
 *                         type: object
 *                       totalRevenue:
 *                         type: number
 *                       transactionCount:
 *                         type: integer
 *                       date:
 *                         type: string
 *                         format: date-time
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Get revenue trends over time
router.get('/revenue-trends', async (req, res) => {
  try {
    const db = getDB();
    const { groupBy = 'day', days = 30 } = req.query; // day, week, month

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    let groupFormat;
    switch (groupBy) {
      case 'week':
        groupFormat = { week: { $week: '$timestamp' }, year: { $year: '$timestamp' } };
        break;
      case 'month':
        groupFormat = { month: { $month: '$timestamp' }, year: { $year: '$timestamp' } };
        break;
      default: // day
        groupFormat = { 
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
    }

    const revenueTrends = await db.collection('transactions')
      .aggregate([
        {
          $match: {
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: groupFormat,
            totalRevenue: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            date: { $first: '$timestamp' }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 }
        }
      ]).toArray();

    res.json({
      period: `${days} days`,
      groupBy,
      trends: revenueTrends.map(item => ({
        period: item._id,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        transactionCount: item.transactionCount,
        date: item.date
      })),
      totalRevenue: revenueTrends.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalTransactions: revenueTrends.reduce((sum, item) => sum + item.transactionCount, 0)
    });

  } catch (error) {
    console.error('Revenue trends error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch revenue trends',
      message: error.message 
    });
  }
});

/**
 * @swagger
 * /api/analytics/customer-segments:
 *   get:
 *     summary: Get customer segmentation analytics
 *     description: Returns customer data segmented by various criteria
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Customer segments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 segments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       segment:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       totalSpend:
 *                         type: number
 *                       averageSpend:
 *                         type: number
 *                 loyaltyTiers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tier:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       totalSpend:
 *                         type: number
 *                       averageSpend:
 *                         type: number
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Get customer segmentation analytics
router.get('/customer-segments', async (req, res) => {
  try {
    const db = getDB();

    const segments = await db.collection('customers')
      .aggregate([
        {
          $group: {
            _id: '$customerSegment',
            count: { $sum: 1 },
            totalSpend: { $sum: '$totalSpend365' },
            averageSpend: { $avg: '$totalSpend365' }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]).toArray();

    const loyaltyTiers = await db.collection('customers')
      .aggregate([
        {
          $group: {
            _id: '$loyaltyTier',
            count: { $sum: 1 },
            totalSpend: { $sum: '$totalSpend365' },
            averageSpend: { $avg: '$totalSpend365' }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]).toArray();

    res.json({
      segments: segments.map(segment => ({
        segment: segment._id || 'unknown',
        count: segment.count,
        totalSpend: Math.round(segment.totalSpend * 100) / 100,
        averageSpend: Math.round(segment.averageSpend * 100) / 100
      })),
      loyaltyTiers: loyaltyTiers.map(tier => ({
        tier: tier._id || 'unknown',
        count: tier.count,
        totalSpend: Math.round(tier.totalSpend * 100) / 100,
        averageSpend: Math.round(tier.averageSpend * 100) / 100
      })),
      totalCustomers: segments.reduce((sum, seg) => sum + seg.count, 0)
    });

  } catch (error) {
    console.error('Customer segments error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch customer segments',
      message: error.message 
    });
  }
});

/**
 * @swagger
 * /api/analytics/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns database health status and available collections
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Health check successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 collections:
 *                   type: array
 *                   items:
 *                     type: string
 *                 database:
 *                   type: string
 *       500:
 *         description: Database connection error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 error:
 *                   type: string
 */
// Get simple health check endpoint
router.get('/health', async (req, res) => {
  try {
    const db = getDB();
    
    // Quick check if collections exist and are accessible
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    res.json({
      status: 'healthy',
      timestamp: new Date(),
      collections: collectionNames,
      database: 'connected'
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date(),
      error: error.message
    });
  }
});

export default router;