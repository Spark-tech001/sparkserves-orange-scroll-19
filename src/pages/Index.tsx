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
  Receipt,
  Download,
  CheckCircle,
  Calendar,
  MapPin
} from "lucide-react";
import jsPDF from 'jspdf';
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
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);

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

      // Create Razorpay order
      const { data: orderData, error: orderError } = await supabase.functions.invoke('create-razorpay-order', {
        body: { 
          amount: totals.total * 100, // Convert to paise
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

      // Generate invoice number and save invoice
      const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number');
      
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          subscription_id: subscription.id,
          customer_id: customer.id,
          invoice_number: invoiceNumber,
          amount: totals.total,
          gst_amount: 0,
          total_amount: totals.total,
          due_date: nextDueDate.toISOString().split('T')[0],
          status: 'paid'
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Save payment record with Razorpay payment ID
      await supabase
        .from('payments')
        .insert({
          invoice_id: invoice.id,
          amount: totals.total,
          status: 'completed',
          payment_method: 'razorpay',
          payment_id: paymentId
        });

      // Generate invoice data for display
      const invoiceData = {
        invoiceNumber: invoiceNumber,
        date: new Date().toLocaleDateString(),
        nextDueDate: nextDueDate.toLocaleDateString(),
        customer: {
          name: restaurantName,
          proprietor: proprietorName,
          address: address,
          pincode: pincode,
          gst: gstNumber || "N/A",
          phone: phoneNumber
        },
        product: products[selectedProduct as keyof typeof products].name,
        tenure: tenures[selectedTenure as keyof typeof tenures].name,
        amount: totals.total,
        savings: totals.savings
      };

      setInvoiceData(invoiceData);
      setShowInvoice(true);
      
      toast({
        title: "Payment Successful!",
        description: "Your subscription has been activated and saved to database.",
      });
    } catch (error) {
      console.error('Error saving data:', error);
      toast({
        title: "Error",
        description: "Payment received but failed to save subscription data. Please contact support.",
        variant: "destructive",
      });
    }
  };

  const downloadInvoice = () => {
    const doc = new jsPDF();
    
    // Company Header with Logo
    doc.setFontSize(24);
    doc.setTextColor(37, 99, 235);
    doc.text('SPARKSERVES', 105, 25, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Restaurant Management Solutions', 105, 35, { align: 'center' });
    doc.text('Email: support@sparkserves.com | Website: www.sparkserves.com', 105, 45, { align: 'center' });
    
    // Draw line separator
    doc.setLineWidth(0.5);
    doc.setDrawColor(200);
    doc.line(20, 55, 190, 55);
    
    // Invoice Title
    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.text('TAX INVOICE', 20, 70);
    
    // Invoice details in a professional table format
    doc.setFontSize(10);
    doc.setTextColor(0);
    
    // Invoice metadata
    doc.rect(20, 80, 80, 30);
    doc.text('Invoice Details:', 25, 88);
    doc.text(`Invoice No: ${invoiceData.invoiceNumber}`, 25, 96);
    doc.text(`Invoice Date: ${invoiceData.date}`, 25, 104);
    
    doc.rect(110, 80, 80, 30);
    doc.text('Payment Details:', 115, 88);
    doc.text(`Payment Status: PAID`, 115, 96);
    doc.text(`Next Due: ${invoiceData.nextDueDate}`, 115, 104);
    
    // Customer details section
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('BILL TO:', 20, 125);
    
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.rect(20, 130, 170, 40);
    doc.text(`Business Name: ${invoiceData.customer.name}`, 25, 140);
    doc.text(`Proprietor: ${invoiceData.customer.proprietor}`, 25, 148);
    doc.text(`Address: ${invoiceData.customer.address}`, 25, 156);
    doc.text(`Pincode: ${invoiceData.customer.pincode}`, 25, 164);
    doc.text(`Phone: ${invoiceData.customer.phone}`, 120, 148);
    if (invoiceData.customer.gst !== "N/A") {
      doc.text(`GST Number: ${invoiceData.customer.gst}`, 120, 156);
    }
    
    // Invoice items table
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('SUBSCRIPTION DETAILS:', 20, 185);
    
    // Table header
    doc.setFillColor(240, 240, 240);
    doc.rect(20, 190, 170, 10, 'F');
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('Description', 25, 197);
    doc.text('Period', 100, 197);
    doc.text('Amount', 150, 197);
    
    // Table content
    doc.rect(20, 200, 170, 15);
    doc.text(`${invoiceData.product} Subscription`, 25, 210);
    doc.text(`${invoiceData.tenure}`, 100, 210);
    doc.text(`₹${invoiceData.amount.toLocaleString()}`, 150, 210);
    
    // Total section
    doc.setFillColor(245, 245, 245);
    doc.rect(130, 220, 60, 25, 'F');
    doc.setFontSize(10);
    doc.text('Subtotal:', 135, 230);
    doc.text(`₹${invoiceData.amount.toLocaleString()}`, 170, 230);
    doc.text('GST (0%):', 135, 237);
    doc.text('₹0', 170, 237);
    
    doc.setFontSize(12);
    doc.setTextColor(37, 99, 235);
    doc.text('TOTAL:', 135, 244);
    doc.text(`₹${invoiceData.amount.toLocaleString()}`, 165, 244);
    
    // Terms and footer
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Terms & Conditions:', 20, 260);
    doc.text('• Payment has been received in full for the subscription period mentioned above.', 20, 267);
    doc.text('• This invoice is computer generated and does not require physical signature.', 20, 273);
    doc.text('• For any queries, please contact us at support@sparkserves.com', 20, 279);
    
    // Thank you note
    doc.setFontSize(10);
    doc.setTextColor(37, 99, 235);
    doc.text('Thank you for choosing SparkServes!', 105, 290, { align: 'center' });
    
    // Save the PDF
    doc.save(`SparkServes-Invoice-${invoiceData.invoiceNumber}.pdf`);
  };

  if (showInvoice && invoiceData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
        <Card className="max-w-4xl w-full shadow-2xl border-0">
          <CardHeader className="text-center bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-t-lg">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <CheckCircle className="h-12 w-12 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold">Payment Successful!</CardTitle>
            <CardDescription className="text-primary-foreground/80 text-lg">
              Your subscription has been activated and saved to our database
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            {/* Success Banner */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-6 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-800">Subscription Activated</h3>
                  <p className="text-green-600 text-sm">Your data has been securely saved to our database</p>
                </div>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="bg-card border rounded-lg p-6 space-y-6">
              <div className="flex items-center space-x-2 mb-4">
                <Receipt className="text-primary h-6 w-6" />
                <span className="font-semibold text-lg">Tax Invoice</span>
              </div>
              
              <div className="grid md:grid-cols-3 gap-6">
                {/* Invoice Info */}
                <div className="space-y-3">
                  <h4 className="font-medium text-primary">Invoice Details</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Invoice Number:</span>
                      <p className="font-mono font-medium">{invoiceData.invoiceNumber}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>
                      <p className="font-medium">{invoiceData.date}</p>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <span className="text-muted-foreground">Next Due:</span>
                        <p className="font-medium">{invoiceData.nextDueDate}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="space-y-3">
                  <h4 className="font-medium text-primary">Customer Details</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Business:</span>
                      <p className="font-medium">{invoiceData.customer.name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Proprietor:</span>
                      <p className="font-medium">{invoiceData.customer.proprietor}</p>
                    </div>
                    <div className="flex items-start space-x-1">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-muted-foreground">Address:</span>
                        <p className="font-medium">{invoiceData.customer.address}</p>
                        <p className="font-medium">PIN: {invoiceData.customer.pincode}</p>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone Number:</span>
                      <p className="font-medium">{invoiceData.customer.phone}</p>
                    </div>
                    {invoiceData.customer.gst !== "N/A" && (
                      <div>
                        <span className="text-muted-foreground">GST Number:</span>
                        <p className="font-mono font-medium">{invoiceData.customer.gst}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Subscription Info */}
                <div className="space-y-3">
                  <h4 className="font-medium text-primary">Subscription</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Product:</span>
                      <p className="font-medium">{invoiceData.product}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Billing Cycle:</span>
                      <p className="font-medium">{invoiceData.tenure}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Savings:</span>
                      <p className="font-medium text-green-600">{invoiceData.savings}</p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Amount Details */}
              <div className="bg-primary/5 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount Paid</p>
                    <p className="text-2xl font-bold text-primary">₹{invoiceData.amount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">GST</p>
                    <p className="font-medium text-green-600">₹0 (Free)</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={downloadInvoice} className="flex-1 h-12" size="lg">
                <Download className="mr-2 h-5 w-5" />
                Download Professional Invoice
              </Button>
              <Button variant="outline" onClick={() => setShowInvoice(false)} className="flex-1 h-12" size="lg">
                Create New Subscription
              </Button>
            </div>

            {/* Footer Note */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                This invoice has been automatically generated and saved to our secure database.
                For any queries, contact support@sparkserves.com
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                          {/* <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="half-yearly">Half Yearly</SelectItem> */}
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

                  <Button className="w-full" size="lg" onClick={handleProceedToPayment}>
                    Proceed to Payment
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
