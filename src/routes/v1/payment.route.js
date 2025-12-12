const express = require("express");
require("dotenv").config();
const {
  ApiError,
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
} = require("@paypal/paypal-server-sdk");
const bodyParser = require("body-parser");

const router = express.Router();
router.use(bodyParser.json());

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;

const client = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: PAYPAL_CLIENT_ID,
    oAuthClientSecret: PAYPAL_CLIENT_SECRET,
  },
  timeout: 0,
  environment: Environment.Sandbox,
  logging: {
    logLevel: "INFO",
    logRequest: { logBody: true },
    logResponse: { logHeaders: true },
  },
});

const ordersController = new OrdersController(client);

/**
 * Create an order to start the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_create
 */
const createOrder = async (cart) => {

  const collect = {
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          amount: {
            currencyCode: "USD",
            value: cart.totalAmount, // Use dynamic value here
          },
        },
      ],
    },
    prefer: "return=minimal",
  };

  try {
    const { body, ...httpResponse } = await ordersController.ordersCreate(collect);
    return {
      jsonResponse: JSON.parse(body),
      httpStatusCode: httpResponse.statusCode,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      console.error("PayPal API Error:", error.responseBody);  // Log full error response
      throw new Error(error.message);
    } else {
      console.error("General Error:", error);
      throw error;
    }
  }
};

/**
 * Capture payment for the created order to complete the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
const captureOrder = async (orderID) => {
  const collect = {
    id: orderID,  // Include the order ID
    prefer: "return=minimal",
  };

  try {
    // Capture payment for the created order
    const { body, ...httpResponse } = await ordersController.ordersCapture(collect);

    return {
      jsonResponse: JSON.parse(body),
      httpStatusCode: httpResponse.statusCode,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      console.error('PayPal API Error:', error);
      throw new Error(error.message);
    } else {
      // Handle other errors (e.g., network or server errors)
      console.error('Error capturing order:', error);
      throw new Error('Error capturing order.');
    }
  }
};


// Only export the routes you need (avoid creating a new server)
router.post("/api/orders", async (req, res) => {
  try {
    const { cart } = req.body; // Use cart details to calculate payment amount
    const { jsonResponse, httpStatusCode } = await createOrder(cart);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to send order:", error);
    res.status(500).json({ error: "Failed to send order." });
  }
});

router.post("/api/orders/:orderID/capture", async (req, res) => {
  const { orderID } = req.params;  // Extract the orderID from the URL parameter
  console.log('Capture Order ID:', orderID);  // Log the order ID for debugging
  try {
    const { orderID } = req.params;
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to capture order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
});

module.exports = router;
