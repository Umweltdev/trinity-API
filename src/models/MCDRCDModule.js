import crypto from 'crypto';
import { getDB } from '../config/database.js';

export class MCDRCDModule {
  constructor(config = {}) {
    this.config = {
      businessId: config.businessId || process.env.BUSINESS_ID || 'default',
      mcd: {
        enabled: config.mcd?.enabled ?? (process.env.MCD_ENABLED !== 'false'),
        updateFrequency: config.mcd?.updateFrequency || process.env.MCD_FREQUENCY || 'daily',
        sensitivityCoefficient: parseFloat(config.mcd?.sensitivityCoefficient || process.env.MCD_SENSITIVITY || 1.0),
        maxPriceIncrease: parseFloat(config.mcd?.maxPriceIncrease || process.env.MCD_MAX_INCREASE || 0.15),
        smoothingFactor: parseFloat(config.mcd?.smoothingFactor || process.env.MCD_SMOOTHING || 0.3),
        minimumSpendThreshold: parseFloat(config.mcd?.minimumSpendThreshold || process.env.MCD_MIN_SPEND || 100),
        // Enhanced MCD features
        platformWeights: config.mcd?.platformWeights || {
          'google': 1.2,
          'facebook': 1.1,
          'instagram': 1.0,
          'twitter': 0.9,
          'email': 0.8
        },
        decayFactor: parseFloat(config.mcd?.decayFactor || process.env.MCD_DECAY_FACTOR || 0.95),
        minMultiplier: parseFloat(config.mcd?.minMultiplier || process.env.MCD_MIN_MULTIPLIER || 0.85),
        maxMultiplier: parseFloat(config.mcd?.maxMultiplier || process.env.MCD_MAX_MULTIPLIER || 1.5)
      },
      rcd: {
        enabled: config.rcd?.enabled ?? (process.env.RCD_ENABLED !== 'false'),
        maxDiscount: parseFloat(config.rcd?.maxDiscount || process.env.RCD_MAX_DISCOUNT || 20.0),
        spendWeight: parseFloat(config.rcd?.spendWeight || process.env.RCD_SPEND_WEIGHT || 2.0),
        frequencyWeight: parseFloat(config.rcd?.frequencyWeight || process.env.RCD_FREQUENCY_WEIGHT || 1.5),
        recencyWeight: parseFloat(config.rcd?.recencyWeight || process.env.RCD_RECENCY_WEIGHT || 1.2),
        thresholds: {
          minimumSpend: config.rcd?.thresholds?.minimumSpend || 50,
          minimumVisits: config.rcd?.thresholds?.minimumVisits || 2,
          loyaltyTier1: config.rcd?.thresholds?.loyaltyTier1 || 500,
          loyaltyTier2: config.rcd?.thresholds?.loyaltyTier2 || 1000
        },
        // Enhanced RCD features
        referralBonus: parseFloat(config.rcd?.referralBonus || process.env.RCD_REFERRAL_BONUS || 5.0),
        seasonalMultipliers: config.rcd?.seasonalMultipliers || {
          'christmas': 1.2,
          'black-friday': 1.3,
          'summer': 1.1,
          'default': 1.0
        },
        productCategoryWeights: config.rcd?.productCategoryWeights || {
          'premium': 1.5,
          'standard': 1.0,
          'budget': 0.8
        }
      },
      // Cross-module optimization
      optimization: {
        enabled: config.optimization?.enabled ?? (process.env.OPTIMIZATION_ENABLED !== 'false'),
        targetROI: parseFloat(config.optimization?.targetROI || process.env.TARGET_ROI || 3.0),
        maxOverallIncrease: parseFloat(config.optimization?.maxOverallIncrease || process.env.MAX_OVERALL_INCREASE || 0.25),
        learningRate: parseFloat(config.optimization?.learningRate || process.env.LEARNING_RATE || 0.1)
      }
    };
    
    this.currentMCDMultiplier = 1.0;
    this.lastMCDUpdate = null;
    this.customerSegments = {}; // Cache for customer segmentation
    this.platformPerformance = {}; // Track platform ROI
  }

  // Enhanced MCD Methods
  async recordMarketingSpend(platform, amount, campaignData = {}) {
    const db = getDB();
    
    if (!platform || amount === undefined) {
      throw new Error('Platform and amount are required');
    }
    
    if (amount < 0) {
      throw new Error('Amount must be positive');
    }
    
    const spend = {
      businessId: this.config.businessId,
      platform: platform.toLowerCase(),
      amount: parseFloat(amount),
      date: new Date(),
      ...campaignData,
      platformWeight: this.config.mcd.platformWeights[platform.toLowerCase()] || 1.0,
      createdAt: new Date()
    };
    
    await db.collection('marketingSpend').insertOne(spend);
    
    // Update platform performance tracking
    await this.updatePlatformPerformance(platform, amount);
    
    if (this.shouldRecalculateMCD()) {
      await this.calculateMCDMultiplier();
    }
    
    return spend;
  }

  async updatePlatformPerformance(platform, amount) {
    const db = getDB();
    const platformKey = platform.toLowerCase();
    
    // Get revenue attributed to this platform (simplified attribution)
    const revenue = await this.calculatePlatformRevenue(platformKey);
    const roi = revenue > 0 ? (revenue / amount) : 0;
    
    this.platformPerformance[platformKey] = {
      totalSpend: (this.platformPerformance[platformKey]?.totalSpend || 0) + amount,
      totalRevenue: revenue,
      roi: roi,
      lastUpdated: new Date()
    };
    
    // Update platform weight based on performance
    await this.optimizePlatformWeights();
  }

  async calculatePlatformRevenue(platform) {
    const db = getDB();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Simplified attribution - in real implementation, use proper attribution model
    const revenue = await db.collection('transactions')
      .aggregate([
        {
          $match: {
            businessId: this.config.businessId,
            timestamp: { $gte: thirtyDaysAgo },
            referralSource: platform // Assuming you track referral sources
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]).toArray();
    
    return revenue[0]?.total || 0;
  }

  async optimizePlatformWeights() {
    if (!this.config.optimization.enabled) return;
    
    Object.entries(this.platformPerformance).forEach(([platform, data]) => {
      if (data.roi > 0) {
        const currentWeight = this.config.mcd.platformWeights[platform] || 1.0;
        const targetROI = this.config.optimization.targetROI;
        const performanceRatio = data.roi / targetROI;
        
        // Adjust weight based on performance (simplified)
        const newWeight = currentWeight * (1 + this.config.optimization.learningRate * (performanceRatio - 1));
        
        // Apply bounds
        this.config.mcd.platformWeights[platform] = Math.max(0.5, Math.min(2.0, newWeight));
      }
    });
  }

  async calculateMCDMultiplier() {
    const db = getDB();
    
    if (!this.config.mcd.enabled) {
      this.currentMCDMultiplier = 1.0;
      return 1.0;
    }
    
    const period = this.getPeriodFromFrequency(this.config.mcd.updateFrequency);
    
    // Get weighted marketing spend
    const marketingSpend = await db.collection('marketingSpend')
      .aggregate([
        {
          $match: {
            businessId: this.config.businessId,
            date: { $gte: period.start, $lte: period.end }
          }
        },
        {
          $addFields: {
            weightedAmount: {
              $multiply: [
                '$amount',
                { $ifNull: ['$platformWeight', 1.0] }
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$weightedAmount' },
            rawTotal: { $sum: '$amount' }
          }
        }
      ]).toArray();
    
    const revenue = await db.collection('transactions')
      .aggregate([
        {
          $match: {
            businessId: this.config.businessId,
            timestamp: { $gte: period.start, $lte: period.end }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]).toArray();
    
    const totalSpend = marketingSpend[0]?.total || 0;
    const rawSpend = marketingSpend[0]?.rawTotal || 0;
    const totalRevenue = revenue[0]?.total || 1;
    
    if (rawSpend < this.config.mcd.minimumSpendThreshold) {
      this.currentMCDMultiplier = 1.0;
      return 1.0;
    }
    
    // Calculate ROI-based multiplier with enhanced formula
    const roi = totalRevenue / totalSpend;
    const targetROI = this.config.optimization.targetROI;
    
    let rawMultiplier;
    if (roi > targetROI) {
      // Good ROI - consider lowering prices or maintaining
      rawMultiplier = 1.0 - (0.1 * ((roi - targetROI) / targetROI));
    } else {
      // Poor ROI - increase prices
      rawMultiplier = 1.0 + (this.config.mcd.sensitivityCoefficient * (targetROI - roi) / targetROI);
    }
    
    // Apply decay to previous multiplier for smoother transitions
    const previousMultiplier = this.currentMCDMultiplier;
    const decayedPrevious = 1.0 + (previousMultiplier - 1.0) * this.config.mcd.decayFactor;
    
    const smoothedMultiplier = this.config.mcd.smoothingFactor * rawMultiplier + 
                              (1 - this.config.mcd.smoothingFactor) * decayedPrevious;
    
    // Apply bounds
    this.currentMCDMultiplier = Math.max(
      this.config.mcd.minMultiplier,
      Math.min(smoothedMultiplier, this.config.mcd.maxMultiplier)
    );
    
    this.lastMCDUpdate = Date.now();
    
    await db.collection('priceAdjustments').insertOne({
      businessId: this.config.businessId,
      mcdMultiplier: this.currentMCDMultiplier,
      effectiveFrom: new Date(),
      marketingSpendUsed: totalSpend,
      revenueInPeriod: totalRevenue,
      roi: roi,
      calculatedROI: roi,
      status: 'active',
      calculationDetails: {
        rawMultiplier,
        previousMultiplier,
        smoothedMultiplier
      }
    });
    
    return this.currentMCDMultiplier;
  }

  // Enhanced RCD Methods
  async recordTransaction(email, amount, referralCode = null, productIds = [], productCategories = []) {
    const db = getDB();
    
    if (!email || amount === undefined) {
      throw new Error('Email and amount are required');
    }
    
    const emailHash = this.hashEmail(email);
    amount = parseFloat(amount);
    
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    
    let customer = await db.collection('customers').findOne({
      businessId: this.config.businessId,
      emailHash
    });
    
    const isNewCustomer = !customer;
    
    if (!customer) {
      customer = {
        businessId: this.config.businessId,
        emailHash,
        email: email.toLowerCase(),
        totalSpend365: 0,
        purchaseCount365: 0,
        firstPurchaseDate: new Date(),
        lastPurchaseDate: new Date(),
        currentDiscountPercentage: 0,
        referralCode: this.generateReferralCode(emailHash),
        referralCount: 0,
        loyaltyTier: 'new',
        customerSegment: this.determineCustomerSegment(null, null, true),
        createdAt: new Date()
      };
      
      await db.collection('customers').insertOne(customer);
    }
    
    const transaction = {
      businessId: this.config.businessId,
      customerEmailHash: emailHash,
      amount,
      timestamp: new Date(),
      discountApplied: customer.currentDiscountPercentage,
      referralCodeUsed: referralCode,
      productIds: productIds || [],
      productCategories: productCategories || [],
      seasonalMultiplier: this.getSeasonalMultiplier(),
      isNewCustomer: isNewCustomer
    };
    
    await db.collection('transactions').insertOne(transaction);
    
    // Handle referral rewards
    if (referralCode) {
      await this.processReferral(referralCode, emailHash, amount);
    }
    
    const newDiscount = await this.updateCustomerVector(customer, transaction);
    
    return {
      discount: newDiscount,
      referralCode: customer.referralCode,
      transaction,
      customerSegment: customer.customerSegment,
      loyaltyTier: customer.loyaltyTier
    };
  }

  async processReferral(referralCode, referredEmailHash, purchaseAmount) {
    const db = getDB();
    
    const referrer = await db.collection('customers').findOne({
      businessId: this.config.businessId,
      referralCode: referralCode.toUpperCase()
    });
    
    if (referrer && referrer.emailHash !== referredEmailHash) {
      const bonus = this.config.rcd.referralBonus;
      
      // Update referrer's discount
      const newDiscount = Math.min(
        this.config.rcd.maxDiscount,
        (referrer.currentDiscountPercentage || 0) + bonus
      );
      
      await db.collection('customers').updateOne(
        { _id: referrer._id },
        {
          $inc: { referralCount: 1 },
          $set: {
            currentDiscountPercentage: newDiscount,
            lastReferralDate: new Date()
          }
        }
      );
      
      // Record referral activity
      await db.collection('referralActivities').insertOne({
        businessId: this.config.businessId,
        referrerEmailHash: referrer.emailHash,
        referredEmailHash: referredEmailHash,
        purchaseAmount: purchaseAmount,
        bonusApplied: bonus,
        timestamp: new Date()
      });
    }
  }

  determineCustomerSegment(totalSpend, purchaseCount, isNew = false) {
    if (isNew) return 'new';
    
    if (totalSpend > this.config.rcd.thresholds.loyaltyTier2) return 'vip';
    if (totalSpend > this.config.rcd.thresholds.loyaltyTier1) return 'loyal';
    if (purchaseCount > 5) return 'frequent';
    
    return 'occasional';
  }

  getSeasonalMultiplier() {
    const now = new Date();
    const month = now.getMonth();
    const date = now.getDate();
    
    // Simple seasonal detection - expand as needed
    if (month === 11 && date > 20) return this.config.rcd.seasonalMultipliers['christmas'];
    if (month === 10 && date > 20) return this.config.rcd.seasonalMultipliers['black-friday'];
    if (month >= 5 && month <= 8) return this.config.rcd.seasonalMultipliers['summer'];
    
    return this.config.rcd.seasonalMultipliers['default'];
  }

  async updateCustomerVector(customer, transaction = null) {
    const db = getDB();
    
    if (!this.config.rcd.enabled) return customer.currentDiscountPercentage || 0;
    
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    
    const stats = await db.collection('transactions')
      .aggregate([
        {
          $match: {
            businessId: this.config.businessId,
            customerEmailHash: customer.emailHash,
            timestamp: { $gte: oneYearAgo }
          }
        },
        {
          $group: {
            _id: null,
            totalSpend: { $sum: '$amount' },
            count: { $sum: 1 },
            avgPurchase: { $avg: '$amount' },
            lastPurchase: { $max: '$timestamp' }
          }
        }
      ]).toArray();
    
    const { totalSpend = 0, count = 0, avgPurchase = 0, lastPurchase = null } = stats[0] || {};
    
    if (totalSpend < this.config.rcd.thresholds.minimumSpend || 
        count < this.config.rcd.thresholds.minimumVisits) {
      await db.collection('customers').updateOne(
        { _id: customer._id },
        {
          $set: {
            totalSpend365: totalSpend,
            purchaseCount365: count,
            currentDiscountPercentage: 0,
            lastCalculated: new Date()
          }
        }
      );
      return 0;
    }
    
    // Calculate recency score (0-1)
    const recencyScore = lastPurchase ? 
      Math.max(0, 1 - ((Date.now() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24 * 30))) : 0;
    
    // Enhanced discount calculation with multiple factors
    const spendComponent = (totalSpend / 1000) * this.config.rcd.spendWeight;
    const frequencyComponent = (count / 10) * this.config.rcd.frequencyWeight;
    const recencyComponent = recencyScore * this.config.rcd.recencyWeight;
    
    const baseDiscount = (spendComponent + frequencyComponent + recencyComponent) / 
                        (this.config.rcd.spendWeight + this.config.rcd.frequencyWeight + this.config.rcd.recencyWeight);
    
    // Apply seasonal multiplier
    const seasonalMultiplier = transaction?.seasonalMultiplier || this.getSeasonalMultiplier();
    const adjustedDiscount = baseDiscount * seasonalMultiplier * 100;
    
    const discount = Math.min(
      this.config.rcd.maxDiscount,
      Math.round(adjustedDiscount * 100) / 100
    );
    
    // Determine customer segment and loyalty tier
    const customerSegment = this.determineCustomerSegment(totalSpend, count);
    const loyaltyTier = this.getLoyaltyTier(totalSpend);
    
    await db.collection('customers').updateOne(
      { _id: customer._id },
      {
        $set: {
          totalSpend365: totalSpend,
          purchaseCount365: count,
          averagePurchase: avgPurchase,
          currentDiscountPercentage: discount,
          lastPurchaseDate: new Date(),
          lastCalculated: new Date(),
          customerSegment: customerSegment,
          loyaltyTier: loyaltyTier
        }
      }
    );
    
    return discount;
  }

  getLoyaltyTier(totalSpend) {
    if (totalSpend > this.config.rcd.thresholds.loyaltyTier2) return 'gold';
    if (totalSpend > this.config.rcd.thresholds.loyaltyTier1) return 'silver';
    return 'bronze';
  }

  // Enhanced Combined Pricing
  async calculateFinalPrice(basePrice, customerEmail = null, productCategory = 'standard') {
    basePrice = parseFloat(basePrice);
    if (basePrice <= 0) {
      throw new Error('Base price must be positive');
    }
    
    if (this.shouldRecalculateMCD()) {
      await this.calculateMCDMultiplier();
    }
    
    const mcdMultiplier = this.currentMCDMultiplier;
    const priceAfterMCD = basePrice * mcdMultiplier;
    
    let rcdDiscount = 0;
    let customerSegment = 'guest';
    
    if (customerEmail) {
      rcdDiscount = await this.getCustomerDiscount(customerEmail);
      
      // Apply product category weighting
      const categoryWeight = this.config.rcd.productCategoryWeights[productCategory] || 1.0;
      rcdDiscount = rcdDiscount * categoryWeight;
      
      // Get customer segment for reporting
      const customer = await this.getCustomerInfo(customerEmail);
      customerSegment = customer?.customerSegment || 'guest';
    }
    
    const discountAmount = priceAfterMCD * (rcdDiscount / 100);
    let finalPrice = priceAfterMCD - discountAmount;
    
    // Ensure price doesn't go below cost (simplified)
    const minPrice = basePrice * 0.7; // 30% minimum margin
    finalPrice = Math.max(minPrice, finalPrice);
    
    return {
      basePrice,
      mcdMultiplier: Math.round(mcdMultiplier * 1000) / 1000,
      priceAfterMCD: Math.round(priceAfterMCD * 100) / 100,
      rcdDiscount: Math.round(rcdDiscount * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalPrice: Math.round(finalPrice * 100) / 100,
      savings: Math.round(discountAmount * 100) / 100,
      customerSegment,
      productCategory,
      calculatedAt: new Date()
    };
  }

  // New Methods for Analytics and Insights
  async getCustomerLifetimeValue(email) {
    const emailHash = this.hashEmail(email);
    const db = getDB();
    
    const customerData = await db.collection('transactions')
      .aggregate([
        {
          $match: {
            businessId: this.config.businessId,
            customerEmailHash: emailHash
          }
        },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$amount' },
            purchaseCount: { $sum: 1 },
            firstPurchase: { $min: '$timestamp' },
            lastPurchase: { $max: '$timestamp' }
          }
        }
      ]).toArray();
    
    if (!customerData.length) return null;
    
    const data = customerData[0];
    const lifetime = (data.lastPurchase - data.firstPurchase) / (1000 * 60 * 60 * 24 * 30); // months
    
    return {
      totalValue: data.totalSpent,
      averageOrderValue: data.totalSpent / data.purchaseCount,
      purchaseFrequency: data.purchaseCount / Math.max(1, lifetime),
      customerLifetime: lifetime
    };
  }

  async getMarketingROI() {
    const db = getDB();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const marketingSpend = await db.collection('marketingSpend')
      .aggregate([
        {
          $match: {
            businessId: this.config.businessId,
            date: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: '$platform',
            totalSpend: { $sum: '$amount' }
          }
        }
      ]).toArray();
    
    const revenue = await db.collection('transactions')
      .aggregate([
        {
          $match: {
            businessId: this.config.businessId,
            timestamp: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' }
          }
        }
      ]).toArray();
    
    const totalSpend = marketingSpend.reduce((sum, item) => sum + item.totalSpend, 0);
    const totalRevenue = revenue[0]?.totalRevenue || 0;
    
    return {
      totalSpend,
      totalRevenue,
      roi: totalSpend > 0 ? (totalRevenue - totalSpend) / totalSpend : 0,
      byPlatform: marketingSpend
    };
  }

  async getCustomerInfo(email) {
    const db = getDB();
    const emailHash = this.hashEmail(email);
    
    return await db.collection('customers').findOne({
      businessId: this.config.businessId,
      emailHash
    });
  }

  // Utility Methods (unchanged)
  hashEmail(email) {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  generateReferralCode(emailHash) {
    const hash = crypto.createHash('sha256')
      .update(emailHash + this.config.businessId + Date.now())
      .digest('hex');
    return hash.substring(0, 8).toUpperCase();
  }

  getPeriodFromFrequency(frequency) {
    const end = new Date();
    const start = new Date();
    
    switch (frequency) {
      case 'hourly':
        start.setHours(start.getHours() - 1);
        break;
      case 'daily':
        start.setDate(start.getDate() - 1);
        break;
      case 'weekly':
        start.setDate(start.getDate() - 7);
        break;
      case 'monthly':
        start.setMonth(start.getMonth() - 1);
        break;
    }
    
    return { start, end };
  }

  shouldRecalculateMCD() {
    if (!this.config.mcd.enabled) return false;
    if (!this.lastMCDUpdate) return true;
    
    const hoursSinceUpdate = (Date.now() - this.lastMCDUpdate) / (1000 * 60 * 60);
    
    switch (this.config.mcd.updateFrequency) {
      case 'hourly': return hoursSinceUpdate >= 1;
      case 'daily': return hoursSinceUpdate >= 24;
      case 'weekly': return hoursSinceUpdate >= 168;
      case 'monthly': return hoursSinceUpdate >= 720;
      default: return false;
    }
  }

  async getCustomerDiscount(email) {
    const db = getDB();
    const emailHash = this.hashEmail(email);
    
    const customer = await db.collection('customers').findOne({
      businessId: this.config.businessId,
      emailHash
    });
    
    if (!customer) return 0;
    
    if (customer.lastCalculated) {
      const hoursSinceCalculation = (Date.now() - customer.lastCalculated.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCalculation > 24) {
        return await this.updateCustomerVector(customer);
      }
    }
    
    return customer.currentDiscountPercentage || 0;
  }
}

export default MCDRCDModule;