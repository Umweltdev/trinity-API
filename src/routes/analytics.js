import { Router } from 'express';
import MCDRCDModule from '../models/MCDRCDModule.js';

const router = Router();
const mcdRcd = new MCDRCDModule();

// Calculate price
router.get('/calculate', async (req, res) => {
  try {
    const { basePrice, email } = req.query;
    
    if (!basePrice) {
      return res.status(400).json({ error: 'Base price required' });
    }
    
    const pricing = await mcdRcd.calculateFinalPrice(
      parseFloat(basePrice),
      email
    );
    
    res.json(pricing);
  } catch (error) {
    console.error('Price calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customer discount - THIS IS THE ENDPOINT YOU'RE TRYING TO TEST
router.get('/customer/:email/discount', async (req, res) => {
  try {
    const { email } = req.params;
    
    // This would be implemented with your analytics logic
    // For now, returning a placeholder response
    res.json({ 
      email, 
      discountPercentage: 10, // Example discount
      message: "Analytics endpoint - implement your logic here" 
    });
  } catch (error) {
    console.error('Get discount error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;