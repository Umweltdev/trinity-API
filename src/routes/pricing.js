import { Router } from 'express';
import MCDRCDModule from '../models/MCDRCDModule.js';

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

export default router;