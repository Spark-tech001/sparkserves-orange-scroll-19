import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  CreditCard,
  Smartphone,
  Building2,
  Calendar,
  MapPin
} from "lucide-react";
import sparkLogo from "@/assets/spark-logo.png";
import { supabase } from "@/integrations/supabase/client";

// Declare Razorpay type for TypeScript
declare global {
  interface Window {
    Razorpay: any;
  }
}

const Index = () => {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState("dine-flow");
  const [selectedTenure, setSelectedTenure] = useState("quarterly");
  const [billingDate, setBillingDate] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [proprietorName, setProprietorName] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [paymentOption, setPaymentOption] = useState<"full" | "partial">("full");

  // Set current date on component mount
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setBillingDate(today);
  }, []);

  // Pricing data
  const products = {
    "dine-flow": { 
      name: "Dine Flow",
      prices: {
        yearly: { amount: 7999, display: "₹7,999", period: "/year", savings: "Save 45%" },
        "half-yearly": { amount: 4499, display: "₹4,499", period: "/6 months", savings: "Save 25%" },
        quarterly: { amount: 3499, display: "₹3,499", period: "/3 months", savings: "Save 10%" }
      }
    },
    "dine-ease": { 
      name: "Dine Ease",
      prices: {
        yearly: { amount: 3999, display: "₹3,999", period: "/year", savings: "Save 50%" },
        "half-yearly": { amount: 2499, display: "₹2,499", period: "/6 months", savings: "Save 30%" },
        quarterly: { amount: 1499, display: "₹1,499", period: "/3 months", savings: "Save 15%" }
      }
    },
    "store-assist": { 
      name: "Store Assist",
      prices: {
        yearly: { amount: 5999, display: "₹5,999", period: "/year", savings: "Save 40%" },
        "half-yearly": { amount: 3499, display: "₹3,499", period: "/6 months", savings: "Save 25%" },
        quarterly: { amount: 2499, display: "₹2,499", period: "/3 months", savings: "Save 10%" }
      }
    }
  };

  const tenures = {
    quarterly: { name: "Quarterly", months: 3 },
    "half-yearly": { name: "Half Yearly", months: 6 },
    yearly: { name: "Annual", months: 12 }
  };

  const calculateTotal = () => {
    const product = products[selectedProduct as keyof typeof products];
    const priceInfo = product.prices[selectedTenure as keyof typeof product.prices];
    const basePrice = priceInfo.amount;
    const discountAmount = Math.round(basePrice * 0.5); // 50% discount
    const subtotal = basePrice - discountAmount;
    const gstAmount = 0; // GST is free (0%) as requested

    return {
      basePrice,
      discountAmount,
      subtotal,
      gstAmount,
      total: subtotal,
      savings: priceInfo.savings
    };
  };

  const totals = calculateTotal();

  const calculateNextDueDate = () => {
    const today = new Date();
    const tenure = tenures[selectedTenure as keyof typeof tenures];
    const nextDue = new Date(today);
    nextDue.setMonth(today.getMonth() + tenure.months);
    return nextDue.toLocaleDateString();
  };

  const handleProceedToPayment = async () => {
    if (!restaurantName || !proprietorName || !address || !pincode || !phoneNumber) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields including phone number.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Load Razorpay script dynamically if not already loaded
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
        
        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      // Calculate payment amount based on selected option
      const paymentAmount = paymentOption === "partial" ? Math.round(totals.total * 0.5) : totals.total;
      
      // Create Razorpay order
      const { data: orderData, error: orderError } = await supabase.functions.invoke('create-razorpay-order', {
        body: { 
          amount: paymentAmount * 100, // Convert to paise
          currency: 'INR',
          receipt: `receipt_${Date.now()}`
        }
      });

      if (orderError) {
        throw new Error(orderError.message);
      }

      const options = {
        key: 'rzp_live_RK5YLrW4IHsqid', // Razorpay public key
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'SparkServes',
        description: `${products[selectedProduct as keyof typeof products].name} Subscription`,
        order_id: orderData.id,
        handler: async function (response: any) {
          try {
            // Verify payment
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }
            });

            if (verifyError || verifyData.status !== 'success') {
              throw new Error('Payment verification failed');
            }

            // Payment verified successfully, now save to database
            await processSuccessfulPayment(response.razorpay_payment_id);
            
          } catch (error) {
            console.error('Payment verification error:', error);
            toast({
              title: "Payment Verification Failed",
              description: "Your payment could not be verified. Please contact support.",
              variant: "destructive",
            });
          }
        },
        prefill: {
          name: proprietorName,
          email: '',
          contact: phoneNumber
        },
        theme: { 
          color: 'hsl(var(--primary))' 
        },
      };

      // @ts-ignore
      const rzp1 = new window.Razorpay(options);
      rzp1.open();
      
    } catch (error) {
      console.error('Payment initiation error:', error);
      toast({
        title: "Payment Error",
        description: "Failed to initiate payment. Please try again.",
        variant: "destructive",
      });
    }
  };

  const processSuccessfulPayment = async (paymentId: string) => {
    try {
      // Calculate payment amount based on selected option
      const paymentAmount = paymentOption === "partial" ? Math.round(totals.total * 0.5) : totals.total;

      // Save customer data to database
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert({
          restaurant_name: restaurantName,
          proprietor_name: proprietorName,
          address: address,
          pincode: pincode,
          gst_number: gstNumber || null,
          phone_number: phoneNumber
        })
        .select()
        .single();

      if (customerError) throw customerError;

      // Calculate subscription dates
      const startDate = new Date();
      const endDate = new Date(startDate);
      const nextDueDate = new Date(startDate);
      const tenure = tenures[selectedTenure as keyof typeof tenures];
      
      endDate.setMonth(startDate.getMonth() + tenure.months);
      nextDueDate.setMonth(startDate.getMonth() + tenure.months);

      // Save subscription data to database
      const { data: subscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert({
          customer_id: customer.id,
          product_type: selectedProduct,
          tenure: selectedTenure,
          amount: totals.total,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          next_due_date: nextDueDate.toISOString().split('T')[0]
        })
        .select()
        .single();

      if (subscriptionError) throw subscriptionError;

      // Save payment record
      await supabase
        .from('payments')
        .insert({
          invoice_id: null,
          amount: paymentAmount,
          status: 'completed',
          payment_method: 'razorpay',
          razorpay_payment_id: paymentId
        });
      
      toast({
        title: "Payment Successful!",
        description: `Your subscription has been activated. ${paymentOption === "partial" ? "Remaining amount will be collected later." : ""}`,
      });

      // Reset form
      setRestaurantName("");
      setProprietorName("");
      setAddress("");
      setPincode("");
      setGstNumber("");
      setPhoneNumber("");
      setPaymentOption("full");
      
    } catch (error) {
      console.error('Error saving data:', error);
      toast({
        title: "Error",
        description: "Payment received but failed to save subscription data. Please contact support.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-start">
              <img src={sparkLogo} alt="SparkServes" className="h-20 md:h-24 lg:h-28 w-auto object-contain" />
            </div>
        </div>
      </header>

      {/* Payment Section */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Complete Your Subscription
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Choose your plan and complete the payment to get started with SparkServes
            </p>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
            {/* Left Column - Subscription Details & Business Info */}
            <div className="lg:col-span-8 space-y-6">
              {/* Subscription Details Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Subscription Details</CardTitle>
                  <CardDescription>Choose your product and billing cycle</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="product">Select Product *</Label>
                    <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dine-flow">Dine Flow</SelectItem>
                        <SelectItem value="dine-ease">Dine Ease</SelectItem>
                        <SelectItem value="store-assist">Store Assist</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tenure">Select Tenure *</Label>
                    <Select value={selectedTenure} onValueChange={setSelectedTenure}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose billing cycle" />
                      </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yearly">Annual</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Business Information Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Business Information</CardTitle>
                  <CardDescription>Provide your business details for setup</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="restaurant-name">Restaurant Name *</Label>
                      <Input 
                        id="restaurant-name" 
                        placeholder="Your Restaurant Name" 
                        value={restaurantName}
                        onChange={(e) => setRestaurantName(e.target.value)}
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="proprietor-name">Proprietor Name *</Label>
                      <Input 
                        id="proprietor-name" 
                        placeholder="Owner Name" 
                        value={proprietorName}
                        onChange={(e) => setProprietorName(e.target.value)}
                        required 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Full Address *</Label>
                    <Textarea 
                      id="address" 
                      placeholder="Complete business address (without pincode)" 
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pincode">Pincode *</Label>
                    <Input 
                      id="pincode" 
                      placeholder="Area pincode" 
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      required 
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="phone-number">Phone Number *</Label>
                      <Input 
                        id="phone-number" 
                        placeholder="Contact Number" 
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gst-number">GST Number (Optional)</Label>
                      <Input 
                        id="gst-number" 
                        placeholder="GST Number" 
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Order Summary */}
            <div className="lg:col-span-4">
              <Card className="sticky top-20">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Product:</span>
                      <span className="font-medium">{products[selectedProduct as keyof typeof products].name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Tenure:</span>
                      <span className="font-medium">{tenures[selectedTenure as keyof typeof tenures].name}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Base Price:</span>
                      <span>₹{totals.basePrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount (50%):</span>
                      <span>-₹{totals.discountAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span>₹{totals.subtotal.toLocaleString()}</span>
                    </div>
                    {totals.savings && (
                      <div className="flex justify-between text-sm text-primary">
                        <span>Plan Savings:</span>
                        <span>{totals.savings}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span>GST:</span>
                      <span className="text-primary font-medium">Free</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span>₹{totals.total.toLocaleString()}</span>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <label className="text-sm font-medium">Payment Option</label>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant={paymentOption === "full" ? "default" : "outline"}
                        onClick={() => setPaymentOption("full")}
                        className="h-auto py-3"
                      >
                        <div className="text-left w-full">
                          <div className="font-semibold">Full Payment</div>
                          <div className="text-xs opacity-80">Pay ₹{totals.total.toLocaleString()}</div>
                        </div>
                      </Button>
                      <Button
                        type="button"
                        variant={paymentOption === "partial" ? "default" : "outline"}
                        onClick={() => setPaymentOption("partial")}
                        className="h-auto py-3"
                      >
                        <div className="text-left w-full">
                          <div className="font-semibold">50% Now</div>
                          <div className="text-xs opacity-80">Pay ₹{Math.round(totals.total * 0.5).toLocaleString()}</div>
                        </div>
                      </Button>
                    </div>
                    {paymentOption === "partial" && (
                      <p className="text-sm text-muted-foreground">
                        Remaining ₹{Math.round(totals.total * 0.5).toLocaleString()} to be paid later
                      </p>
                    )}
                  </div>

                  <Button className="w-full" size="lg" onClick={handleProceedToPayment}>
                    {paymentOption === "full" ? "Proceed to Payment" : "Pay 50% Now"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;  
