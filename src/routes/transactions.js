import { Router } from 'express';
import MCDRCDModule from '../models/MCDRCDModule.js';

const router = Router();
const mcdRcd = new MCDRCDModule();

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