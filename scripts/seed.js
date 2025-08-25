import { connectDB } from '../src/config/database.js';
import MCDRCDModule from '../src/models/MCDRCDModule.js';

async function seed() {
  try {
    await connectDB();
    const mcdRcd = new MCDRCDModule();
    
    console.log('Seeding database...');
    
    // Add marketing spend
    for (const platform of ['google', 'facebook', 'instagram']) {
      await mcdRcd.recordMarketingSpend(platform, Math.random() * 1000 + 500);
    }
    
    // Add customers and transactions
    for (const email of ['demo1@example.com', 'demo2@example.com', 'demo3@example.com']) {
      for (let i = 0; i < 5; i++) {
        await mcdRcd.recordTransaction(email, Math.random() * 500 + 100);
      }
    }
    
    console.log('Seed complete!');
  } catch (error) {
    console.error('Seed failed:', error);
  }
}

seed();