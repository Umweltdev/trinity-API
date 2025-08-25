import { connectToDatabase, closeDatabase } from '../src/config/database.js';
import { MCDRCDModule } from '../src/models/MCDRCDModule.js';

describe('MCD-RCD Edge Cases', () => {
  let mcdRcd;
  
  beforeAll(async () => {
    await connectToDatabase();
    mcdRcd = new MCDRCDModule({
      businessId: 'test-edge-cases'
    });
  });
  
  afterAll(async () => {
    await closeDatabase();
  });

  // Invalid input tests
  test('should throw error for negative marketing spend', async () => {
    await expect(mcdRcd.recordMarketingSpend('google', -100))
      .rejects.toThrow('Amount must be positive');
  });

  test('should throw error for missing platform', async () => {
    await expect(mcdRcd.recordMarketingSpend('', 100))
      .rejects.toThrow('Platform and amount are required');
  });

  test('should throw error for negative transaction amount', async () => {
    await expect(mcdRcd.recordTransaction('test@example.com', -50))
      .rejects.toThrow('Amount must be positive');
  });

  test('should throw error for zero transaction amount', async () => {
    await expect(mcdRcd.recordTransaction('test@example.com', 0))
      .rejects.toThrow('Amount must be positive');
  });

  test('should throw error for missing email', async () => {
    await expect(mcdRcd.recordTransaction('', 100))
      .rejects.toThrow('Email and amount are required');
  });

  test('should throw error for negative base price', async () => {
    await expect(mcdRcd.calculateFinalPrice(-100, 'test@example.com'))
      .rejects.toThrow('Base price must be positive');
  });

  test('should throw error for zero base price', async () => {
    await expect(mcdRcd.calculateFinalPrice(0, 'test@example.com'))
      .rejects.toThrow('Base price must be positive');
  });

  // Edge case: Very small amounts
  test('should handle very small marketing spend', async () => {
    const spend = await mcdRcd.recordMarketingSpend('test', 0.01);
    expect(spend.amount).toBe(0.01);
  });

  test('should handle very small transaction', async () => {
    const result = await mcdRcd.recordTransaction('small@example.com', 0.01);
    expect(result.transaction.amount).toBe(0.01);
  });

  test('should handle very small base price', async () => {
    const pricing = await mcdRcd.calculateFinalPrice(0.01, 'test@example.com');
    expect(pricing.finalPrice).toBeGreaterThan(0);
  });

  // Edge case: Very large amounts
  test('should handle very large marketing spend', async () => {
    const spend = await mcdRcd.recordMarketingSpend('test', 1000000);
    expect(spend.amount).toBe(1000000);
  });

  test('should handle very large transaction', async () => {
    const result = await mcdRcd.recordTransaction('large@example.com', 1000000);
    expect(result.transaction.amount).toBe(1000000);
  });

  test('should handle very large base price', async () => {
    const pricing = await mcdRcd.calculateFinalPrice(1000000, 'test@example.com');
    expect(pricing.finalPrice).toBeGreaterThan(0);
  });

  // Edge case: Email variations
  test('should handle email with uppercase', async () => {
    const result1 = await mcdRcd.recordTransaction('UPPERCASE@EXAMPLE.COM', 100);
    const result2 = await mcdRcd.recordTransaction('uppercase@example.com', 100);
    
    // Both should create the same hash and be treated as same customer
    const discount1 = await mcdRcd.getCustomerDiscount('UPPERCASE@EXAMPLE.COM');
    const discount2 = await mcdRcd.getCustomerDiscount('uppercase@example.com');
    
    expect(discount1).toBe(discount2);
  });

  test('should handle email with spaces', async () => {
    await mcdRcd.recordTransaction('  spaced@example.com  ', 100);
    const discount = await mcdRcd.getCustomerDiscount('spaced@example.com');
    expect(typeof discount).toBe('number');
  });

  // Edge case: MCD with no spend data
  test('should return 1.0 multiplier when no marketing spend', async () => {
    const emptyModule = new MCDRCDModule({
      businessId: 'empty-test'
    });
    const multiplier = await emptyModule.calculateMCDMultiplier();
    expect(multiplier).toBe(1.0);
  });

  // Edge case: RCD for non-existent customer
  test('should return 0 discount for non-existent customer', async () => {
    const discount = await mcdRcd.getCustomerDiscount('nonexistent@example.com');
    expect(discount).toBe(0);
  });

  // Edge case: Empty referral code
  test('should handle empty referral code', async () => {
    const result = await mcdRcd.recordTransaction('noreferral@example.com', 100, '');
    expect(result.transaction.referralCodeUsed).toBe('');
  });

  // Edge case: No product IDs
  test('should handle empty product IDs array', async () => {
    const result = await mcdRcd.recordTransaction('noproducts@example.com', 100, null, []);
    expect(result.transaction.productIds).toEqual([]);
  });

  // Edge case: Null product IDs
  test('should handle null product IDs', async () => {
    const result = await mcdRcd.recordTransaction('nullproducts@example.com', 100, null, null);
    expect(result.transaction.productIds).toEqual([]);
  });
});