import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_RP_NAME: z.string().default('ClockAm'),
  WEBAUTHN_ORIGIN: z.string().default('http://localhost:5173'),

  // Assistant (server-side only; never expose the key to the web app)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(15).default(8),
  AGENT_TIMEOUT_MS: z.coerce.number().int().min(5000).default(60000),
  AGENT_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(20),
  AGENT_CONFIRM_TTL_SECONDS: z.coerce.number().int().min(30).default(300),
  AGENT_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),

  // Email (password reset). Leave MAIL_PROVIDER as none until you have an email service.
  MAIL_PROVIDER: z.enum(['none', 'resend', 'console']).default('none'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(), // e.g. ClockAm <no-reply@frankiecode.org.ng>
  WEB_APP_URL: z.string().optional(), // where reset links point; defaults to WEBAUTHN_ORIGIN

  // ZKTeco standalone units push punches over plain HTTP and identify themselves only by serial number.
  // Leave off unless you use one. See the README before turning it on.
  ZKTECO_PUSH_ENABLED: z.enum(['true', 'false']).default('false'),

  // Billing. Prices are set inside the app by a platform admin, not here. Billing never locks anyone until BILLING_ENFORCED=true.
  BILLING_ENFORCED: z.enum(['true', 'false']).default('false'),
  PAYSTACK_SECRET_KEY: z.string().optional(), // server-side only: set on Render, never on Vercel

  // Platform admin (Frankiecode staff who may see the site audit report): comma-separated USER IDS.
  // IDs are used instead of emails because emails are not verified at sign-up.
  PLATFORM_ADMIN_USER_IDS: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export const env = {
  ...parsed.data,
  corsOrigins: list(parsed.data.CORS_ORIGINS),
  mail: { provider: parsed.data.MAIL_PROVIDER, resendApiKey: parsed.data.RESEND_API_KEY, from: parsed.data.MAIL_FROM, nodeEnv: parsed.data.NODE_ENV },
  webAppUrl: (parsed.data.WEB_APP_URL || parsed.data.WEBAUTHN_ORIGIN).replace(/\/+$/, ''),
  billingEnforced: parsed.data.BILLING_ENFORCED === 'true',
  paystackSecretKey: parsed.data.PAYSTACK_SECRET_KEY,
  platformAdminIds: list(parsed.data.PLATFORM_ADMIN_USER_IDS),
};
