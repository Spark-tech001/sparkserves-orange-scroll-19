import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID') || 'rzp_live_RK5YLrW4IHsqid';
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!razorpayKeySecret) {
      console.error('RAZORPAY_KEY_SECRET not found');
      return new Response(
        JSON.stringify({ error: 'Razorpay configuration missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { amount = 50000, currency = 'INR', receipt = 'receipt#1' } = await req.json();

    console.log('Creating Razorpay order with amount:', amount);

    // Create Razorpay order
    const options = {
      amount: amount, // amount in paise
      currency: currency,
      receipt: receipt,
    };

    const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Razorpay API error:', errorText);
      throw new Error(`Razorpay API error: ${response.status}`);
    }

    const order = await response.json();
    console.log('Order created successfully:', order.id);

    return new Response(
      JSON.stringify(order),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error creating order:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})