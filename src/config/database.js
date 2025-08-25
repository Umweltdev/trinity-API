import mongoose from 'mongoose';

let dbConnection = null;

const connectToDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mcd-rcd-db';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    dbConnection = mongoose.connection;
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

const closeDatabase = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    dbConnection = null;
  } catch (error) {
    console.error('Error closing database connection:', error);
    throw error;
  }
};

// Function to get the database connection for your module
const getDB = () => {
  if (!dbConnection) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return dbConnection;
};

// Handle connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  dbConnection = null;
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
  dbConnection = mongoose.connection;
});

export { connectToDatabase, closeDatabase, getDB };