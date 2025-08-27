import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCD-RCD API Documentation',
      version: '1.0.0',
      description: 'API documentation for Marketing Cost Displacement and Returning Customer Discount system',
      contact: {
        name: 'API Support',
        email: 'habeeb@umweltdev.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: 'Development server'
      },
      {
        url: 'https://trinity-api-14zh.onrender.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        PriceCalculation: {
          type: 'object',
          properties: {
            basePrice: { type: 'number' },
            finalPrice: { type: 'number' },
            mcdAdjustment: {
              type: 'object',
              properties: {
                multiplier: { type: 'number' },
                percentage: { type: 'number' },
                description: { type: 'string' }
              }
            },
            rcdDiscount: {
              type: 'object',
              properties: {
                percentage: { type: 'number' },
                amount: { type: 'number' },
                details: {
                  type: 'object',
                  properties: {
                    eligible: { type: 'boolean' },
                    customerSegment: { type: 'string' },
                    productCategory: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js'] // Path to your route files
};

const specs = swaggerJsdoc(options);

export { swaggerUi, specs };