const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("production", "development", "test")
      .required(),
    PORT: Joi.number().default(3000),
    MONGODB_URL: Joi.string().required().description("Mongo DB url"),
    JWT_SECRET: Joi.string().required().description("JWT secret key"),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(30)
      .description("minutes after which access tokens expire"),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description("days after which refresh tokens expire"),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which reset password token expires"),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which verify email token expires"),
    RESEND_API_KEY: Joi.string().required().description("Resend API key"),
    EMAIL_FROM: Joi.string().description(
      "the from field in the emails sent by the app",
    ),
    // Square configuration
    SQUARE_APPLICATION_ID: Joi.string().description("Square application ID"),
    SQUARE_APPLICATION_SECRET: Joi.string().description(
      "Square application secret",
    ),
    SQUARE_ENVIRONMENT: Joi.string()
      .valid("sandbox", "production")
      .default("sandbox")
      .description("Square environment"),
    SQUARE_REDIRECT_URI: Joi.string().description("Square OAuth redirect URI"),
    // Stripe configuration
    STRIPE_PUBLISHABLE_KEY: Joi.string().description("Stripe publishable key"),
    STRIPE_SECRET_KEY: Joi.string().description("Stripe secret key"),
    FRONTEND_URL: Joi.string().description("Frontend application URL"),
    // Groq AI configuration
    GROQ_API_KEY: Joi.string().description("Groq API key"),
    GROQ_MODEL: Joi.string()
      .default("mixtral-8x7b-32768")
      .description("Groq model to use"),
    GROQ_MAX_TOKENS: Joi.number()
      .default(2048)
      .description("Maximum tokens for Groq response"),
    GROQ_TEMPERATURE: Joi.number()
      .default(0.8)
      .description("Temperature for Groq response"),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env);

// console.log("Loaded environment variables:", envVars);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === "test" ? "-test" : ""),
    options: {
      useCreateIndex: true,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    accessExpirationHours: envVars.JWT_ACCESS_EXPIRATION_HOURS,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes:
      envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  email: {
    resendApiKey: envVars.RESEND_API_KEY,
    from: envVars.EMAIL_FROM,
  },
  square: {
    applicationId: envVars.SQUARE_APPLICATION_ID,
    applicationSecret: envVars.SQUARE_APPLICATION_SECRET,
    environment: envVars.SQUARE_ENVIRONMENT,
    redirectUri: envVars.SQUARE_REDIRECT_URI,
  },
  stripe: {
    publishableKey: envVars.STRIPE_PUBLISHABLE_KEY,
    secretKey: envVars.STRIPE_SECRET_KEY,
  },
  frontend: {
    url: envVars.FRONTEND_URL,
  },
  groq: {
    apiKey: envVars.GROQ_API_KEY,
    model: envVars.GROQ_MODEL,
    maxTokens: envVars.GROQ_MAX_TOKENS,
    temperature: envVars.GROQ_TEMPERATURE,
  },
};
