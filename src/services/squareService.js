const { SquareClient, SquareEnvironment } = require('square');
const axios = require('axios');
const User = require('../models/user.model');
const config = require('../config/config');
const fs = require('fs').promises;
const path = require('path');

class SquareService {
  constructor() {
    this.applicationId = config.square.applicationId;
    this.applicationSecret = config.square.applicationSecret;
    this.environment = config.square.environment === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox;
    
    // Dynamic redirect URI based on environment and config
    this.redirectUri = this.getRedirectUri();
    
    // Initialize logging
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
    
    console.log('Square Service initialized:', {
      environment: this.environment === SquareEnvironment.Production ? 'production' : 'sandbox',
      redirectUri: this.redirectUri,
      applicationId: this.applicationId ? 'SET' : 'NOT SET'
    });
  }

  // Mask sensitive data before logging
  maskSensitive(obj) {
    try {
      if (!obj || typeof obj !== 'object') return obj;
      const clone = JSON.parse(JSON.stringify(obj));
      if (clone.source_id) {
        const s = String(clone.source_id);
        clone.source_id = s.length > 8 ? s.substring(0, 6) + '***' : '***';
      }
      if (clone.sourceId) {
        const s = String(clone.sourceId);
        clone.sourceId = s.length > 8 ? s.substring(0, 6) + '***' : '***';
      }
      if (clone.client_secret) clone.client_secret = '***';
      if (clone.authorization) clone.authorization = '***';
      if (clone.card && clone.card.number) clone.card.number = '***';
      if (clone.Authorization) clone.Authorization = 'Bearer ***';
      return clone;
    } catch (e) {
      return undefined;
    }
  }

  async logSquareHttpRequest(method, path, body, headers) {
    return this.logSquareActivity('http_request', {
      method,
      path,
      body: this.maskSensitive(body),
      headers: this.maskSensitive(headers)
    });
  }

  async logSquareHttpResponse(method, path, statusCode, result) {
    return this.logSquareActivity('http_response', {
      method,
      path,
      statusCode,
      result: this.maskSensitive(result)
    });
  }

  async logSquareHttpError(method, path, error) {
    return this.logSquareActivity('http_error', {
      method,
      path,
      errorName: error?.name,
      message: error?.message,
      statusCode: error?.response?.status,
      body: error?.response?.data
    });
  }

  // Ensure log directory exists
  async ensureLogDirectory() {
    try {
      // Skip file logging in serverless environments like Vercel
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        console.log('Serverless environment detected - skipping file logging setup');
        return;
      }
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  // Comprehensive logging function
  async logSquareActivity(operation, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      operation,
      environment: this.environment === SquareEnvironment.Production ? 'production' : 'sandbox',
      ...data
    };

    // Console log (always available)
    console.log(`[SQUARE ${operation.toUpperCase()}]`, JSON.stringify(logEntry, null, 2));

    // File log (only in non-serverless environments)
    try {
      // Skip file logging in serverless environments like Vercel
      if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        return logEntry;
      }

      const logFile = path.join(this.logDir, `square-${new Date().toISOString().split('T')[0]}.log`);
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }

    return logEntry;
  }

  // Helper method to get dynamic redirect URI
  getRedirectUri() {
    // Priority: config value > environment variable > dynamic based on NODE_ENV
    if (config.square?.redirectUri) {
      return config.square.redirectUri;
    }
    
    const baseUrl = process.env.BACKEND_URL || 
                   (process.env.NODE_ENV === 'production' 
                     ? 'https://musicapp2025-be.vercel.app'
                     : `http://localhost:${process.env.PORT || '5051'}`);
    
    return `${baseUrl}/v1/square/callback`;
  }

  // Create payment using direct REST API with comprehensive logging
  async createPayment(userId, paymentData) {
    try {
      const accessToken = process.env.SQUARE_ACCESS_TOKEN;
      const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
      const baseUrl = environment === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
      
      const requestBody = {
        idempotency_key: paymentData.idempotencyKey,
        amount_money: {
          amount: Number(paymentData.amount), // in cents
          currency: paymentData.currency || 'USD'
        },
        source_id: paymentData.sourceId,
        autocomplete: true
      };

      if (process.env.SQUARE_LOCATION_ID) {
        requestBody.location_id = process.env.SQUARE_LOCATION_ID;
      }

      if (paymentData.buyerEmailAddress) {
        requestBody.buyer_email_address = paymentData.buyerEmailAddress;
      }

      if (paymentData.note) {
        requestBody.note = paymentData.note;
      }

      if (paymentData.referenceId) {
        requestBody.reference_id = paymentData.referenceId;
      }

      if (paymentData.appFeeMoney) {
        requestBody.app_fee_money = {
          amount: Number(paymentData.appFeeMoney.amount),
          currency: paymentData.appFeeMoney.currency || 'USD'
        };
      }

      const url = `${baseUrl}/v2/payments`;
      const headers = {
        'Square-Version': '2025-07-16',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      await this.logSquareHttpRequest('POST', '/v2/payments', requestBody, headers);
      
      const response = await axios.post(url, requestBody, { headers });
      
      await this.logSquareHttpResponse('POST', '/v2/payments', response.status, response.data);
      
      return response.data;
    } catch (error) {
      await this.logSquareHttpError('POST', '/v2/payments', error);
      
      // Handle axios error format
      if (error.response) {
        throw new Error(`Square API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to create payment: ${error.message}`);
    }
  }

  // Get payment by ID using direct REST API
  async getPayment(userId, paymentId) {
    try {
      const accessToken = process.env.SQUARE_ACCESS_TOKEN;
      const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
      const baseUrl = environment === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
      
      const url = `${baseUrl}/v2/payments/${paymentId}`;
      const headers = {
        'Square-Version': '2025-07-16',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      const path = `/v2/payments/${paymentId}`;
      await this.logSquareHttpRequest('GET', path, null, headers);
      
      const response = await axios.get(url, { headers });
      
      await this.logSquareHttpResponse('GET', path, response.status, response.data);
      
      return response.data;
    } catch (error) {
      await this.logSquareHttpError('GET', `/v2/payments/${paymentId}`, error);
      
      if (error.response) {
        throw new Error(`Square API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to get payment: ${error.message}`);
    }
  }

  // Test payment creation with sample data
  async testPaymentCreation() {
    const testData = {
      idempotencyKey: `test-${Date.now()}`,
      amount: 1000, // $10.00
      currency: 'USD',
      sourceId: 'ccof:GaJGNaZa8x4OgDJn4GB', // Sample from your curl
      note: 'Test payment from backend',
      referenceId: 'test-ref-123'
    };

    console.log('🧪 Testing Square payment creation...');
    console.log('Test data:', testData);

    try {
      const result = await this.createPayment('test-user', testData);
      console.log('✅ Payment test successful!');
      return result;
    } catch (error) {
      console.log('❌ Payment test failed:', error.message);
      throw error;
    }
  }

  // Check if user is connected to Square
  async isUserConnected(userId) {
    try {
      const user = await User.findById(userId);
      return !!(user && user.squareCredentials?.accessToken);
    } catch (error) {
      return false;
    }
  }
}

module.exports = new SquareService();
