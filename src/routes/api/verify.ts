import crypto from "crypto";
import type { ActionFunction } from "@remix-run/node";

export let action: ActionFunction = async ({ request }) => {
  const body = await request.json();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  const sign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (sign === razorpay_signature) {
    return new Response(JSON.stringify({ status: "success" }), {
      headers: { "Content-Type": "application/json" },
    });
  } else {
    return new Response(JSON.stringify({ status: "failed" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
};
