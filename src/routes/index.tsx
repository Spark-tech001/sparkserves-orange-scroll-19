import { useEffect } from "react";

export default function Index() {
  const handlePayment = async () => {
    const res = await fetch("/api/order");
    const order = await res.json();

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID, // from .env (public key)
      amount: order.amount,
      currency: order.currency,
      name: "sparkserves",
      description: "Transaction",
      order_id: order.id,
      handler: function (response: any) {
        alert(`Payment successful! Payment ID: ${response.razorpay_payment_id}`);
      },
      theme: { color: "#3399cc" },
    };

    // @ts-ignore
    const rzp1 = new window.Razorpay(options);
    rzp1.open();
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">Pay with Razorpay</h1>
      <button
        onClick={handlePayment}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg"
      >
        Pay Now
      </button>
    </div>
  );
}
