import { Router } from 'express';
import MCDRCDModule from '../models/MCDRCDModule.js';

const router = Router();
const mcdRcd = new MCDRCDModule();
/**
 * @swagger
 * components:
 *   schemas:
 *     Transaction:
 *       type: object
 *       required:
 *         - email
 *         - amount
 *       properties:
 *         email:
 *           type: string
 *           description: Customer email address
 *           example: customer@example.com
 *         amount:
 *           type: number
 *           description: Transaction amount
 *           example: 150.00
 *         referralCode:
 *           type: string
 *           description: Referral code used (if any)
 *           example: REF12345
 *         productIds:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of product IDs purchased
 *           example: ["prod_001", "prod_002"]
 *     MarketingSpend:
 *       type: object
 *       required:
 *         - platform
 *         - amount
 *       properties:
 *         platform:
 *           type: string
 *           description: Marketing platform name
 *           example: google
 *         amount:
 *           type: number
 *           description: Amount spent
 *           example: 5000.00
 *         campaignData:
 *           type: object
 *           description: Additional campaign information
 *           properties:
 *             campaignName:
 *               type: string
 *               example: Summer Sale Campaign
 *             campaignId:
 *               type: string
 *               example: camp_12345
 *             targetAudience:
 *               type: string
 *               example: age_25-40
 *     TransactionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         transaction:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               description: Transaction ID
 *             email:
 *               type: string
 *             amount:
 *               type: number
 *             finalAmount:
 *               type: number
 *             discountApplied:
 *               type: number
 *             referralCode:
 *               type: string
 *             timestamp:
 *               type: string
 *               format: date-time
 *         customer:
 *           type: object
 *           properties:
 *             segment:
 *               type: string
 *             loyaltyTier:
 *               type: string
 *             totalSpend:
 *               type: number
 *     MarketingSpendResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         spend:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             platform:
 *               type: string
 *             amount:
 *               type: number
 *             campaignData:
 *               type: object
 *             timestamp:
 *               type: string
 *               format: date-time
 *         currentMCDMultiplier:
 *           type: number
 *           description: Updated MCD multiplier after recording spend
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error message
 */

/**
 * @swagger
 * tags:
 *   - name: Transactions
 *     description: Customer transaction operations
 *   - name: Marketing
 *     description: Marketing spend operations
 */

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Record a customer transaction
 *     description: Records a transaction and applies appropriate discounts based on customer history and marketing costs
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Transaction'
 *           examples:
 *             basicTransaction:
 *               summary: Basic transaction
 *               value:
 *                 email: "customer@example.com"
 *                 amount: 150.00
 *             referralTransaction:
 *               summary: Transaction with referral
 *               value:
 *                 email: "customer@example.com"
 *                 amount: 200.00
 *                 referralCode: "REF12345"
 *                 productIds: ["prod_001", "prod_002"]
 *     responses:
 *       200:
 *         description: Transaction recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TransactionResponse'
 *             examples:
 *               successResponse:
 *                 summary: Successful transaction recording
 *                 value:
 *                   success: true
 *                   transaction:
 *                     id: "txn_12345"
 *                     email: "customer@example.com"
 *                     amount: 150.00
 *                     finalAmount: 135.00
 *                     discountApplied: 15.00
 *                     referralCode: null
 *                     timestamp: "2024-01-15T10:30:00.000Z"
 *                   customer:
 *                     segment: "returning"
 *                     loyaltyTier: "silver"
 *                     totalSpend: 1250.00
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingEmail:
 *                 summary: Missing email field
 *                 value:
 *                   error: "Email and amount required"
 *               missingAmount:
 *                 summary: Missing amount field
 *                 value:
 *                   error: "Email and amount required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Record transaction
router.post('/', async (req, res) => {
  try {
    const { email, amount, referralCode, productIds } = req.body;
    
    if (!email || !amount) {
      return res.status(400).json({ error: 'Email and amount required' });
    }
    
    const result = await mcdRcd.recordTransaction(
      email, 
      amount, 
      referralCode, 
      productIds
    );
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/transactions/marketing:
 *   post:
 *     summary: Record marketing spend
 *     description: Records marketing expenditure which affects the Marketing Cost Displacement (MCD) multiplier
 *     tags: [Marketing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MarketingSpend'
 *           examples:
 *             basicSpend:
 *               summary: Basic marketing spend
 *               value:
 *                 platform: "google"
 *                 amount: 5000.00
 *             campaignSpend:
 *               summary: Campaign marketing spend
 *               value:
 *                 platform: "facebook"
 *                 amount: 3000.00
 *                 campaignData:
 *                   campaignName: "Holiday Campaign"
 *                   campaignId: "camp_67890"
 *                   targetAudience: "age_18-35"
 *     responses:
 *       200:
 *         description: Marketing spend recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MarketingSpendResponse'
 *             examples:
 *               successResponse:
 *                 summary: Successful marketing spend recording
 *                 value:
 *                   success: true
 *                   spend:
 *                     id: "spend_12345"
 *                     platform: "google"
 *                     amount: 5000.00
 *                     campaignData: {}
 *                     timestamp: "2024-01-15T10:30:00.000Z"
 *                   currentMCDMultiplier: 1.15
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingPlatform:
 *                 summary: Missing platform field
 *                 value:
 *                   error: "Platform and amount required"
 *               missingAmount:
 *                 summary: Missing amount field
 *                 value:
 *                   error: "Platform and amount required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Record marketing spend
router.post('/marketing', async (req, res) => {
  try {
    const { platform, amount, campaignData } = req.body;
    
    if (!platform || !amount) {
      return res.status(400).json({ error: 'Platform and amount required' });
    }
    
    const result = await mcdRcd.recordMarketingSpend(
      platform,
      amount,
      campaignData
    );
    
    res.json({ success: true, spend: result });
  } catch (error) {
    console.error('Marketing spend error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;