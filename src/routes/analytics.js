import { Router } from 'express';
import { getDB } from '../config/database.js';

const router = Router();

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