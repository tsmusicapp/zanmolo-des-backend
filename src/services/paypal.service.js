const axios = require("axios");
const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const base64 = require("base-64");

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

/**
 * Get PayPal Access Token (Client Credentials)
 * @returns {Promise<string>} Access Token
 */
const getAccessToken = async () => {
  try {
    const auth = base64.encode(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);
    const response = await axios.post(
      `${PAYPAL_API_URL}/v1/oauth2/token`,
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    return response.data.access_token;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get PayPal access token: ${error.message}`,
    );
  }
};

/**
 * Exchange Authorization Code for Access Token (Connect with PayPal)
 * @param {string} code - Authorization code from frontend callback
 * @returns {Promise<Object>} Token response
 */
const exchangeAuthCode = async (code) => {
  try {
    const auth = base64.encode(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`);

    const redirectUri = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/callback/paypal`;

    console.log(
      `${PAYPAL_API_URL}/v1/oauth2/token`,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const response = await axios.post(
      `${PAYPAL_API_URL}/v1/oauth2/token`,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error(
      "PayPal Token Exchange Error:",
      error.response?.data || error.message,
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Failed to connect PayPal account",
    );
  }
};

/**
 * Get User Info using Access Token
 * @param {string} accessToken
 * @returns {Promise<Object>} User Info
 */
const getUserInfo = async (accessToken) => {
  try {
    const response = await axios.get(
      `${PAYPAL_API_URL}/v1/identity/oauth2/userinfo?schema=paypalv1.1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error(
      "PayPal User Info Error:",
      error.response?.data || error.message,
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Failed to fetch PayPal user info",
    );
  }
};

/**
 * Create a Payout (Send money to user)
 * @param {Object} payoutData
 * @returns {Promise<Object>} Payout Batch
 */
const createPayout = async ({
  receiverEmail,
  amount,
  currency = "USD",
  note,
  senderItemId,
}) => {
  try {
    const accessToken = await getAccessToken();

    const payoutPayload = {
      sender_batch_header: {
        sender_batch_id: `Payouts_${Date.now()}`,
        email_subject: "You have a payout!",
        email_message: note || "You have received a payout from our platform.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: {
            value: amount.toFixed(2),
            currency: currency,
          },
          note: note,
          sender_item_id: senderItemId,
          receiver: receiverEmail,
        },
      ],
    };

    const response = await axios.post(
      `${PAYPAL_API_URL}/v1/payments/payouts`,
      payoutPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "PayPal Payout Error:",
      error.response?.data || error.message,
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Payout failed: ${error.response?.data?.message || error.message}`,
    );
  }
};

/**
 * Create a PayPal Order (Checkout V2)
 * @param {Object} orderData - { amount, currency }
 * @returns {Promise<Object>} Order Response
 */
const createOrder = async ({ amount, currency = "USD" }) => {
  try {
    const accessToken = await getAccessToken();
    const payload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        },
      ],
    };

    const response = await axios.post(
      `${PAYPAL_API_URL}/v2/checkout/orders`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "PayPal Create Order Error:",
      error.response?.data || error.message,
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to create PayPal order: ${
        error.response?.data?.message || error.message
      }`,
    );
  }
};

/**
 * Capture a PayPal Order (Checkout V2)
 * @param {string} orderId
 * @returns {Promise<Object>} Capture Response
 */
const captureOrder = async (orderId) => {
  try {
    const accessToken = await getAccessToken();
    const response = await axios.post(
      `${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error(
      "PayPal Capture Order Error:",
      error.response?.data || error.message,
    );
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Failed to capture PayPal order: ${
        error.response?.data?.message || error.message
      }`,
    );
  }
};

module.exports = {
  paypalService: {
    getAccessToken,
    exchangeAuthCode,
    getUserInfo,
    createPayout,
    createOrder,
    captureOrder,
  },
};
