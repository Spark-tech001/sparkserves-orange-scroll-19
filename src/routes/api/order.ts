import type { LoaderFunction } from "@remix-run/node";
import Razorpay from "razorpay";

export let loader: LoaderFunction = async ({ request }) => {
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  const options = {
    amount: 50000, // amount in paise (₹500)
    currency: "INR",
    receipt: "receipt#1",
  };

  const order = await razorpay.orders.create(options);

  return new Response(JSON.stringify(order), {
    headers: { "Content-Type": "application/json" },
  });
};
