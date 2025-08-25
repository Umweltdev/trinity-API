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
        minimumSpendThreshold: parseFloat(config.mcd?.minimumSpendThreshold || process.env.MCD_MIN_SPEND || 100)
      },
      rcd: {
        enabled: config.rcd?.enabled ?? (process.env.RCD_ENABLED !== 'false'),
        maxDiscount: parseFloat(config.rcd?.maxDiscount || process.env.RCD_MAX_DISCOUNT || 20.0),
        spendWeight: parseFloat(config.rcd?.spendWeight || process.env.RCD_SPEND_WEIGHT || 2.0),
        thresholds: {
          minimumSpend: config.rcd?.thresholds?.minimumSpend || 50,
          minimumVisits: config.rcd?.thresholds?.minimumVisits || 2
        }
      }
    };
    
    this.currentMCDMultiplier = 1.0;
    this.lastMCDUpdate = null;
  }

  // MCD Methods
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
      createdAt: new Date()
    };
    
    await db.collection('marketingSpend').insertOne(spend);
    
    if (this.shouldRecalculateMCD()) {
      await this.calculateMCDMultiplier();
    }
    
    return spend;
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

  async calculateMCDMultiplier() {
    const db = getDB();
    
    if (!this.config.mcd.enabled) {
      this.currentMCDMultiplier = 1.0;
      return 1.0;
    }
    
    const period = this.getPeriodFromFrequency(this.config.mcd.updateFrequency);
    
    const marketingSpend = await db.collection('marketingSpend')
      .aggregate([
        {
          $match: {
            businessId: this.config.businessId,
            date: { $gte: period.start, $lte: period.end }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
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
    const totalRevenue = revenue[0]?.total || 1;
    
    if (totalSpend < this.config.mcd.minimumSpendThreshold) {
      this.currentMCDMultiplier = 1.0;
      return 1.0;
    }
    
    const rawMultiplier = 1 + (totalSpend / totalRevenue) * this.config.mcd.sensitivityCoefficient;
    const previousMultiplier = this.currentMCDMultiplier;
    const smoothedMultiplier = this.config.mcd.smoothingFactor * rawMultiplier + 
                              (1 - this.config.mcd.smoothingFactor) * previousMultiplier;
    
    this.currentMCDMultiplier = Math.min(smoothedMultiplier, 1 + this.config.mcd.maxPriceIncrease);
    this.lastMCDUpdate = Date.now();
    
    await db.collection('priceAdjustments').insertOne({
      businessId: this.config.businessId,
      mcdMultiplier: this.currentMCDMultiplier,
      effectiveFrom: new Date(),
      marketingSpendUsed: totalSpend,
      revenueInPeriod: totalRevenue,
      status: 'active'
    });
    
    return this.currentMCDMultiplier;
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

  // RCD Methods
  async recordTransaction(email, amount, referralCode = null, productIds = []) {
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
    
    if (!customer) {
      customer = {
        businessId: this.config.businessId,
        emailHash,
        email: email.toLowerCase(),
        totalSpend365: 0,
        purchaseCount365: 0,
        firstPurchaseDate: new Date(),
        currentDiscountPercentage: 0,
        referralCode: this.generateReferralCode(emailHash),
        referralCount: 0,
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
      productIds: productIds || []
    };
    
    await db.collection('transactions').insertOne(transaction);
    
    const newDiscount = await this.updateCustomerVector(customer);
    
    return {
      discount: newDiscount,
      referralCode: customer.referralCode,
      transaction
    };
  }

  async updateCustomerVector(customer) {
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
            count: { $sum: 1 }
          }
        }
      ]).toArray();
    
    const { totalSpend = 0, count = 0 } = stats[0] || {};
    
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
    
    const weightedSpend = totalSpend * this.config.rcd.spendWeight;
    const frequency = count;
    const magnitude = Math.sqrt(Math.pow(weightedSpend, 2) + Math.pow(frequency, 2));
    
    const normalizedMagnitude = this.normalizeMagnitude(magnitude);
    const discount = Math.min(
      this.config.rcd.maxDiscount,
      Math.round(normalizedMagnitude * this.config.rcd.maxDiscount * 1000) / 1000
    );
    
    await db.collection('customers').updateOne(
      { _id: customer._id },
      {
        $set: {
          totalSpend365: totalSpend,
          purchaseCount365: count,
          currentDiscountPercentage: discount,
          lastPurchaseDate: new Date(),
          lastCalculated: new Date()
        }
      }
    );
    
    return discount;
  }

  normalizeMagnitude(magnitude) {
    // Simplified normalization - you can expand this as needed
    return Math.min(1, magnitude / 10000);
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

  // Combined Pricing
  async calculateFinalPrice(basePrice, customerEmail = null) {
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
    if (customerEmail) {
      rcdDiscount = await this.getCustomerDiscount(customerEmail);
    }
    
    const discountAmount = priceAfterMCD * (rcdDiscount / 100);
    const finalPrice = priceAfterMCD - discountAmount;
    
    return {
      basePrice,
      mcdMultiplier,
      priceAfterMCD: Math.round(priceAfterMCD * 100) / 100,
      rcdDiscount,
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalPrice: Math.round(finalPrice * 100) / 100,
      savings: Math.round(discountAmount * 100) / 100
    };
  }

  // Utility Methods
  hashEmail(email) {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  generateReferralCode(emailHash) {
    const hash = crypto.createHash('sha256')
      .update(emailHash + this.config.businessId + Date.now())
      .digest('hex');
    return hash.substring(0, 8).toUpperCase();
  }
}

export default MCDRCDModule;