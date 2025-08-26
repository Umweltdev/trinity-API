import { Router } from 'express';
import MCDRCDModule from '../models/MCDRCDModule.js';
import { getDB } from '../config/database.js';

const router = Router();
const mcdRcd = new MCDRCDModule();

// Calculate price with MCD and RCD logic
router.get('/calculate', async (req, res) => {
  try {
    const { basePrice, email, productCategory = 'standard' } = req.query;
    
    if (!basePrice) {
      return res.status(400).json({ error: 'Base price required' });
    }
    
    const numericBasePrice = parseFloat(basePrice);
    
    // Use the enhanced model to calculate final price
    const priceResult = await mcdRcd.calculateFinalPrice(numericBasePrice, email, productCategory);
    
    res.json({
      basePrice: priceResult.basePrice,
      finalPrice: priceResult.finalPrice,
      mcdAdjustment: {
        multiplier: priceResult.mcdMultiplier,
        percentage: parseFloat(((priceResult.mcdMultiplier - 1) * 100).toFixed(1)),
        description: 'Marketing Cost Displacement adjustment'
      },
      rcdDiscount: {
        percentage: priceResult.rcdDiscount,
        amount: priceResult.discountAmount,
        details: {
          eligible: priceResult.rcdDiscount > 0,
          customerSegment: priceResult.customerSegment,
          productCategory: priceResult.productCategory
        }
      },
      breakdown: {
        priceAfterMCD: priceResult.priceAfterMCD,
        discountAmount: priceResult.discountAmount,
        finalPrice: priceResult.finalPrice,
        savings: priceResult.savings
      },
      calculatedAt: priceResult.calculatedAt
    });
    
  } catch (error) {
    console.error('Price calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record marketing spend (new endpoint)
router.post('/marketing-spend', async (req, res) => {
  try {
    const { platform, amount, campaignName, campaignId } = req.body;
    
    if (!platform || !amount) {
      return res.status(400).json({ error: 'Platform and amount are required' });
    }
    
    const spendRecord = await mcdRcd.recordMarketingSpend(platform, amount, {
      campaignName,
      campaignId
    });
    
    res.json({
      success: true,
      message: 'Marketing spend recorded successfully',
      record: spendRecord,
      currentMCDMultiplier: mcdRcd.currentMCDMultiplier
    });
    
  } catch (error) {
    console.error('Marketing spend recording error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record transaction (new endpoint)
router.post('/transaction', async (req, res) => {
  try {
    const { email, amount, referralCode, productIds, productCategories } = req.body;
    
    if (!email || !amount) {
      return res.status(400).json({ error: 'Email and amount are required' });
    }
    
    const transactionResult = await mcdRcd.recordTransaction(
      email, 
      amount, 
      referralCode, 
      productIds, 
      productCategories
    );
    
    res.json({
      success: true,
      message: 'Transaction recorded successfully',
      transaction: transactionResult.transaction,
      discount: transactionResult.discount,
      referralCode: transactionResult.referralCode,
      customerSegment: transactionResult.customerSegment,
      loyaltyTier: transactionResult.loyaltyTier
    });
    
  } catch (error) {
    console.error('Transaction recording error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customer discount details
router.get('/customer/:email/discount', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    // Get customer info from enhanced model
    const customerInfo = await mcdRcd.getCustomerInfo(email);
    
    if (!customerInfo) {
      return res.json({
        email,
        eligible: false,
        discountPercentage: 0,
        message: "New customer - no discount history",
        suggestions: [
          "Complete first purchase to become eligible for discounts",
          "Join loyalty program for immediate benefits"
        ]
      });
    }
    
    const { 
      totalSpend365 = 0, 
      purchaseCount365 = 0, 
      currentDiscountPercentage = 0,
      customerSegment = 'new',
      loyaltyTier = 'bronze',
      lastPurchaseDate,
      referralCount = 0
    } = customerInfo;
    
    // Calculate progress to next tier
    let nextTier = "";
    let progressToNextTier = 0;
    let requiredSpend = 0;
    
    if (loyaltyTier === 'bronze') {
      nextTier = 'silver';
      requiredSpend = mcdRcd.config.rcd.thresholds.loyaltyTier1 - totalSpend365;
      progressToNextTier = Math.min((totalSpend365 / mcdRcd.config.rcd.thresholds.loyaltyTier1) * 100, 100);
    } else if (loyaltyTier === 'silver') {
      nextTier = 'gold';
      requiredSpend = mcdRcd.config.rcd.thresholds.loyaltyTier2 - totalSpend365;
      progressToNextTier = Math.min((totalSpend365 / mcdRcd.config.rcd.thresholds.loyaltyTier2) * 100, 100);
    }
    
    // Time-based metrics
    const daysSinceLastPurchase = lastPurchaseDate 
      ? Math.floor((new Date() - new Date(lastPurchaseDate)) / (1000 * 60 * 60 * 24))
      : 999;
    
    res.json({
      email,
      eligible: currentDiscountPercentage > 0,
      discountPercentage: currentDiscountPercentage,
      loyaltyTier,
      customerSegment,
      customerMetrics: {
        totalSpend: totalSpend365,
        visitCount: purchaseCount365,
        daysSinceLastPurchase,
        averageOrderValue: purchaseCount365 > 0 ? totalSpend365 / purchaseCount365 : 0,
        referralCount
      },
      progress: nextTier ? {
        nextTier,
        progressPercentage: Math.round(progressToNextTier),
        requiredSpend: Math.max(0, requiredSpend),
        currentSpend: totalSpend365
      } : null,
      personalizedMessage: `As a ${loyaltyTier} ${customerSegment} customer, you qualify for ${currentDiscountPercentage}% off your next purchase!`,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    
  } catch (error) {
    console.error('Get discount error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customer lifetime value
router.get('/customer/:email/lifetime-value', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }
    
    const clv = await mcdRcd.getCustomerLifetimeValue(email);
    
    if (!clv) {
      return res.status(404).json({ 
        error: 'Customer not found or no purchase history' 
      });
    }
    
    res.json({
      email,
      lifetimeValue: clv,
      customerValueScore: Math.min(100, Math.round((clv.totalValue / 5000) * 100)) // Score out of 100
    });
    
  } catch (error) {
    console.error('Lifetime value error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get marketing ROI analytics
router.get('/analytics/marketing-roi', async (req, res) => {
  try {
    const roiData = await mcdRcd.getMarketingROI();
    
    res.json({
      analytics: roiData,
      currentMCDMultiplier: mcdRcd.currentMCDMultiplier,
      platformWeights: mcdRcd.config.mcd.platformWeights
    });
    
  } catch (error) {
    console.error('Marketing ROI error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get price simulation for multiple scenarios
router.get('/simulate', async (req, res) => {
  try {
    const { basePrice, email, productCategory = 'standard' } = req.query;
    
    if (!basePrice) {
      return res.status(400).json({ error: 'Base price required' });
    }
    
    const numericBasePrice = parseFloat(basePrice);
    const scenarios = [];
    
    // Get current MCD multiplier
    const currentMultiplier = mcdRcd.currentMCDMultiplier;
    
    // Scenario 1: Base price only
    scenarios.push({
      scenario: "Base Price",
      price: numericBasePrice,
      mcdMultiplier: 1.0,
      discount: 0,
      finalPrice: numericBasePrice,
      description: "No adjustments applied"
    });
    
    // Scenario 2: With current MCD adjustment only
    scenarios.push({
      scenario: "With Current MCD Adjustment",
      price: numericBasePrice,
      mcdMultiplier: currentMultiplier,
      discount: 0,
      finalPrice: numericBasePrice * currentMultiplier,
      description: `Current marketing conditions (${((currentMultiplier - 1) * 100).toFixed(1)}% adjustment)`
    });
    
    // Scenario 3: With customer discount only
    if (email) {
      const discountPercentage = await mcdRcd.getCustomerDiscount(email);
      scenarios.push({
        scenario: "With RCD Discount Only",
        price: numericBasePrice,
        mcdMultiplier: 1.0,
        discount: discountPercentage,
        finalPrice: numericBasePrice * (1 - discountPercentage / 100),
        description: `Customer loyalty discount (${discountPercentage}%)`
      });
    }
    
    // Scenario 4: Combined MCD and RCD (current state)
    if (email) {
      const discountPercentage = await mcdRcd.getCustomerDiscount(email);
      const finalPriceResult = await mcdRcd.calculateFinalPrice(numericBasePrice, email, productCategory);
      
      scenarios.push({
        scenario: "Combined MCD + RCD (Current)",
        price: numericBasePrice,
        mcdMultiplier: currentMultiplier,
        discount: discountPercentage,
        finalPrice: finalPriceResult.finalPrice,
        description: `Current marketing + customer loyalty (${((currentMultiplier - 1) * 100).toFixed(1)}% + ${discountPercentage}%)`
      });
    }
    
    // Scenario 5: High marketing spend scenario
    scenarios.push({
      scenario: "High Marketing Spend Scenario",
      price: numericBasePrice,
      mcdMultiplier: mcdRcd.config.mcd.maxMultiplier,
      discount: 0,
      finalPrice: numericBasePrice * mcdRcd.config.mcd.maxMultiplier,
      description: `Maximum marketing adjustment (${((mcdRcd.config.mcd.maxMultiplier - 1) * 100).toFixed(1)}%)`
    });
    
    // Scenario 6: VIP customer scenario
    if (email) {
      scenarios.push({
        scenario: "VIP Customer Scenario",
        price: numericBasePrice,
        mcdMultiplier: 1.0,
        discount: mcdRcd.config.rcd.maxDiscount,
        finalPrice: numericBasePrice * (1 - mcdRcd.config.rcd.maxDiscount / 100),
        description: `Maximum customer discount (${mcdRcd.config.rcd.maxDiscount}%)`
      });
    }
    
    res.json({
      basePrice: numericBasePrice,
      scenarios,
      currentMCDMultiplier: currentMultiplier,
      recommendation: scenarios.reduce((best, current) => 
        current.finalPrice < best.finalPrice ? current : best
      , scenarios[0])
    });
    
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current MCD multiplier
router.get('/mcd-multiplier', async (req, res) => {
  try {
    if (mcdRcd.shouldRecalculateMCD()) {
      await mcdRcd.calculateMCDMultiplier();
    }
    
    res.json({
      multiplier: mcdRcd.currentMCDMultiplier,
      lastUpdated: mcdRcd.lastMCDUpdate,
      config: mcdRcd.config.mcd
    });
    
  } catch (error) {
    console.error('MCD multiplier error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Force MCD recalculation
router.post('/recalculate-mcd', async (req, res) => {
  try {
    const newMultiplier = await mcdRcd.calculateMCDMultiplier();
    
    res.json({
      success: true,
      newMultiplier,
      previousMultiplier: mcdRcd.currentMCDMultiplier,
      lastUpdated: new Date()
    });
    
  } catch (error) {
    console.error('MCD recalculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get marketing spend by platform
router.get('/marketing-spend', async (req, res) => {
  try {
    const db = getDB();
    const { 
      platform, 
      period = '30d',
      groupBy = 'platform' // platform, campaign, week, month
    } = req.query;

    // Calculate date range based on period
    const startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '180d':
        startDate.setDate(startDate.getDate() - 180);
        break;
      case 'ytd':
        startDate.setMonth(0, 1); // January 1st
        startDate.setHours(0, 0, 0, 0);
        break;
      default: // 30d
        startDate.setDate(startDate.getDate() - 30);
    }

    // Build match criteria
    const matchCriteria = {
      businessId: mcdRcd.config.businessId,
      date: { $gte: startDate }
    };

    // Filter by specific platform if provided
    if (platform && platform !== 'all') {
      matchCriteria.platform = platform.toLowerCase();
    }

    let groupFormat;
    switch (groupBy) {
      case 'campaign':
        groupFormat = { 
          platform: '$platform',
          campaignName: '$campaignName',
          campaignId: '$campaignId'
        };
        break;
      case 'week':
        groupFormat = { 
          platform: '$platform',
          week: { $week: '$date' },
          year: { $year: '$date' }
        };
        break;
      case 'month':
        groupFormat = { 
          platform: '$platform',
          month: { $month: '$date' },
          year: { $year: '$date' }
        };
        break;
      default: // platform
        groupFormat = { platform: '$platform' };
    }

    // Get marketing spend data
    const marketingSpend = await db.collection('marketingSpend')
      .aggregate([
        {
          $match: matchCriteria
        },
        {
          $group: {
            _id: groupFormat,
            totalSpend: { $sum: '$amount' },
            campaignCount: { $sum: 1 },
            averageSpend: { $avg: '$amount' },
            minSpend: { $min: '$amount' },
            maxSpend: { $max: '$amount' },
            lastSpendDate: { $max: '$date' },
            firstSpendDate: { $min: '$date' }
          }
        },
        {
          $sort: { totalSpend: -1 }
        }
      ]).toArray();

    // Get trend data (spend over time)
    const spendTrend = await db.collection('marketingSpend')
      .aggregate([
        {
          $match: matchCriteria
        },
        {
          $group: {
            _id: {
              week: { $week: '$date' },
              year: { $year: '$date' },
              platform: '$platform'
            },
            weeklySpend: { $sum: '$amount' },
            weekStart: { $min: '$date' }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.week': 1 }
        }
      ]).toArray();

    // Get platform performance metrics
    const platformPerformance = [];
    for (const spend of marketingSpend) {
      const platformName = spend._id.platform || spend._id;
      const revenue = await mcdRcd.calculatePlatformRevenue(platformName);
      const spendAmount = spend.totalSpend;
      const roi = spendAmount > 0 ? ((revenue - spendAmount) / spendAmount) * 100 : 0;

      platformPerformance.push({
        platform: platformName,
        spend: spendAmount,
        revenue: revenue,
        roi: roi,
        romi: spendAmount > 0 ? (revenue / spendAmount) : 0,
        breakEven: revenue >= spendAmount
      });
    }

    res.json({
      period,
      dateRange: {
        start: startDate,
        end: new Date()
      },
      filters: {
        platform: platform || 'all',
        groupBy
      },
      summary: {
        totalSpend: marketingSpend.reduce((sum, item) => sum + item.totalSpend, 0),
        totalCampaigns: marketingSpend.reduce((sum, item) => sum + item.campaignCount, 0),
        platformCount: marketingSpend.length,
        averageSpendPerCampaign: marketingSpend.reduce((sum, item) => sum + item.averageSpend, 0) / marketingSpend.length
      },
      byPlatform: marketingSpend.map(item => ({
        platform: item._id.platform || item._id,
        totalSpend: Math.round(item.totalSpend * 100) / 100,
        averageSpend: Math.round(item.averageSpend * 100) / 100,
        minSpend: Math.round(item.minSpend * 100) / 100,
        maxSpend: Math.round(item.maxSpend * 100) / 100,
        campaignCount: item.campaignCount,
        dateRange: {
          firstSpend: item.firstSpendDate,
          lastSpend: item.lastSpendDate
        }
      })),
      performance: platformPerformance.map(item => ({
        platform: item.platform,
        spend: Math.round(item.spend * 100) / 100,
        revenue: Math.round(item.revenue * 100) / 100,
        roi: Math.round(item.roi * 100) / 100,
        romi: Math.round(item.romi * 100) / 100,
        breakEven: item.breakEven,
        efficiency: item.roi > 0 ? 'profitable' : item.roi === 0 ? 'break-even' : 'unprofitable'
      })),
      trends: spendTrend.map(item => ({
        platform: item._id.platform,
        week: item._id.week,
        year: item._id.year,
        spend: Math.round(item.weeklySpend * 100) / 100,
        weekStart: item.weekStart
      })),
      topPerforming: platformPerformance
        .filter(item => item.spend > 0)
        .sort((a, b) => b.roi - a.roi)
        .slice(0, 3)
        .map(item => ({
          platform: item.platform,
          roi: Math.round(item.roi * 100) / 100
        })),
      calculatedAt: new Date()
    });

  } catch (error) {
    console.error('Marketing spend analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch marketing spend data',
      message: error.message 
    });
  }
});

// Get marketing spend for a specific campaign
router.get('/marketing-spend/campaign/:campaignId', async (req, res) => {
  try {
    const db = getDB();
    const { campaignId } = req.params;

    const campaignSpend = await db.collection('marketingSpend')
      .aggregate([
        {
          $match: {
            businessId: mcdRcd.config.businessId,
            campaignId: campaignId
          }
        },
        {
          $group: {
            _id: {
              campaignId: '$campaignId',
              campaignName: '$campaignName',
              platform: '$platform'
            },
            totalSpend: { $sum: '$amount' },
            spendEntries: { $sum: 1 },
            startDate: { $min: '$date' },
            endDate: { $max: '$date' },
            averageSpend: { $avg: '$amount' }
          }
        }
      ]).toArray();

    if (!campaignSpend.length) {
      return res.status(404).json({ 
        error: 'Campaign not found' 
      });
    }

    const campaign = campaignSpend[0];
    const revenue = await mcdRcd.calculatePlatformRevenue(campaign._id.platform);
    const spendAmount = campaign.totalSpend;
    const roi = spendAmount > 0 ? ((revenue - spendAmount) / spendAmount) * 100 : 0;

    res.json({
      campaign: {
        id: campaign._id.campaignId,
        name: campaign._id.campaignName,
        platform: campaign._id.platform,
        totalSpend: Math.round(campaign.totalSpend * 100) / 100,
        spendEntries: campaign.spendEntries,
        durationDays: campaign.endDate && campaign.startDate ? 
          Math.ceil((campaign.endDate - campaign.startDate) / (1000 * 60 * 60 * 24)) : 1,
        averageSpend: Math.round(campaign.averageSpend * 100) / 100,
        dateRange: {
          start: campaign.startDate,
          end: campaign.endDate
        }
      },
      performance: {
        revenue: Math.round(revenue * 100) / 100,
        roi: Math.round(roi * 100) / 100,
        romi: Math.round((revenue / spendAmount) * 100) / 100,
        breakEven: revenue >= spendAmount
      }
    });

  } catch (error) {
    console.error('Campaign spend error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch campaign data',
      message: error.message 
    });
  }
});

// Get all available platforms
router.get('/marketing-spend/platforms', async (req, res) => {
  try {
    const db = getDB();

    const platforms = await db.collection('marketingSpend')
      .aggregate([
        {
          $match: {
            businessId: mcdRcd.config.businessId
          }
        },
        {
          $group: {
            _id: '$platform',
            totalSpend: { $sum: '$amount' },
            campaignCount: { $sum: 1 },
            lastUsed: { $max: '$date' }
          }
        },
        {
          $sort: { totalSpend: -1 }
        }
      ]).toArray();

    res.json({
      platforms: platforms.map(platform => ({
        name: platform._id,
        totalSpend: Math.round(platform.totalSpend * 100) / 100,
        campaignCount: platform.campaignCount,
        lastUsed: platform.lastUsed,
        weight: mcdRcd.config.mcd.platformWeights[platform._id] || 1.0
      })),
      totalPlatforms: platforms.length
    });

  } catch (error) {
    console.error('Platforms error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch platforms',
      message: error.message 
    });
  }
});

export default router;