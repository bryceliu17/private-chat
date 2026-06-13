const crypto = require("crypto");
const express = require("express");
const {
  PUBLIC_ORIGIN,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  SUPPORT_AMOUNT_CENTS,
  SUPPORT_CURRENCY,
} = require("./config");
const { db } = require("./db");

let paymentsSchemaPromise = null;

function ensurePaymentsSchema() {
  if (!paymentsSchemaPromise) {
    paymentsSchemaPromise = db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id text primary key,
        user_id bigint references users(id) on delete set null,
        username text not null,
        amount_cents integer not null,
        currency text not null,
        status text not null,
        stripe_session_id text unique,
        stripe_payment_intent text,
        created_at bigint not null,
        updated_at bigint not null
      )
    `);
  }

  return paymentsSchemaPromise;
}

function getPublicOrigin(req) {
  return (PUBLIC_ORIGIN || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

async function createStripeCheckoutSession({ amountCents, currency, origin, session }) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/?support=success`,
    cancel_url: `${origin}/?support=cancelled`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": "Private Chat support",
    "metadata[userId]": String(session.userId),
    "metadata[username]": session.username,
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Stripe checkout session failed.");
  }

  return data;
}

function parseStripeSignature(signatureHeader) {
  return String(signatureHeader || "")
    .split(",")
    .map((part) => part.split("="))
    .reduce((result, [key, value]) => ({
      ...result,
      [key]: [...(result[key] || []), value],
    }), {});
}

function verifyStripeSignature(rawBody, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  }

  const parsed = parseStripeSignature(signatureHeader);
  const timestamp = parsed.t?.[0];
  const signatures = parsed.v1 || [];

  if (!timestamp || !signatures.length) {
    throw new Error("Missing Stripe signature.");
  }

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto
    .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const isValid = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature || "", "hex");

    return (
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    );
  });

  if (!isValid) {
    throw new Error("Invalid Stripe signature.");
  }
}

async function upsertPaymentFromCheckoutSession(checkoutSession) {
  const metadata = checkoutSession.metadata || {};
  const now = Date.now();
  const userId = Number(metadata.userId);
  const username = String(metadata.username || "unknown");
  const amountCents = Number(checkoutSession.amount_total || 0);
  const currency = String(checkoutSession.currency || SUPPORT_CURRENCY);
  const status = checkoutSession.payment_status === "paid" ? "paid" : checkoutSession.payment_status;

  await ensurePaymentsSchema();
  await db.run(`
    INSERT INTO payments (
      id,
      user_id,
      username,
      amount_cents,
      currency,
      status,
      stripe_session_id,
      stripe_payment_intent,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
    ON CONFLICT(stripe_session_id) DO UPDATE SET
      status = excluded.status,
      stripe_payment_intent = excluded.stripe_payment_intent,
      updated_at = excluded.updated_at
  `, [
    crypto.randomUUID(),
    Number.isInteger(userId) ? userId : null,
    username,
    amountCents,
    currency,
    status,
    checkoutSession.id,
    checkoutSession.payment_intent || "",
    now,
  ]);
}

function registerPaymentWebhookRoute(app) {
  app.post("/api/payments/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      verifyStripeSignature(req.body, req.headers["stripe-signature"]);
      const event = JSON.parse(req.body.toString("utf8"));

      if (event.type === "checkout.session.completed") {
        await upsertPaymentFromCheckoutSession(event.data.object);
      }

      return res.json({
        received: true,
      });
    } catch (error) {
      console.error("Stripe webhook failed:", error);
      return res.status(400).send("Webhook failed");
    }
  });
}

function registerPaymentRoutes(app, { requireSession }) {
  app.post("/api/payments/create-checkout-session", async (req, res) => {
    const session = await requireSession(req, res);

    if (!session) {
      return;
    }

    try {
      await ensurePaymentsSchema();
      const checkoutSession = await createStripeCheckoutSession({
        amountCents: SUPPORT_AMOUNT_CENTS,
        currency: SUPPORT_CURRENCY,
        origin: getPublicOrigin(req),
        session,
      });

      return res.json({
        url: checkoutSession.url,
      });
    } catch (error) {
      console.error("Cannot create Stripe checkout session:", error);
      return res.status(500).json({
        message: "Cannot start payment.",
      });
    }
  });
}

module.exports = {
  registerPaymentRoutes,
  registerPaymentWebhookRoute,
};
