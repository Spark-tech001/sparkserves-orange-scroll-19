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

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({ error: 'Missing required payment verification data' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Verifying payment for order:', razorpay_order_id);

    // Create the signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(razorpayKeySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expectedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const isValid = expectedSignature === razorpay_signature;

    console.log('Payment verification result:', isValid ? 'success' : 'failed');

    if (isValid) {
      // Here you could store the payment info in your database
      // const supabase = createClient(
      //   Deno.env.get('SUPABASE_URL') ?? '',
      //   Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      // );
      
      return new Response(
        JSON.stringify({ 
          status: 'success',
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } else {
      return new Response(
        JSON.stringify({ status: 'failed', error: 'Invalid signature' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('Error verifying payment:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})