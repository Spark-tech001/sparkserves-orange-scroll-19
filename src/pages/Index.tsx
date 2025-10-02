import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import supabase from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const CheckoutPage = () => {
  const [subscription, setSubscription] = useState<any>(null);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [partialAmount, setPartialAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchSubscription = async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error(error);
        toast.error('Failed to fetch subscription.');
      } else {
        setSubscription(data);
        setSubscriptionId(data?.id);
      }
    };

    fetchSubscription();
  }, []);

  const handleProceedToPayment = async () => {
    if (!subscription) return;

    setLoading(true);
    try {
      const totals = {
        subtotal: subscription.plans?.price || 0,
        discount: subscription.discount || 0,
        total: (subscription.plans?.price || 0) - (subscription.discount || 0),
      };

      // ✅ Final payment amount (partial or full)
      const amountToPay = isPartialPayment
        ? Math.min(Number(partialAmount), totals.total)
        : totals.total;

      if (isPartialPayment && (!partialAmount || Number(partialAmount) < 500)) {
        toast.error('Partial payment must be at least ₹500.');
        setLoading(false);
        return;
      }

      const { data: orderData, error: orderError } = await supabase.functions.invoke(
        'create-razorpay-order',
        {
          body: {
            amount: amountToPay * 100, // paise
            currency: 'INR',
            receipt: `receipt_${Date.now()}`,
          },
        }
      );

      if (orderError) throw orderError;

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: 'INR',
        name: 'Spark Serves',
        description: subscription.plans?.name,
        order_id: orderData.id,
        handler: async (response: any) => {
          await processSuccessfulPayment(
            response.razorpay_payment_id,
            amountToPay,
            totals.total
          );
        },
        prefill: {
          email: subscription.email,
          contact: subscription.phone,
        },
        theme: { color: '#3399cc' },
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error(error);
      toast.error('Payment failed.');
    } finally {
      setLoading(false);
    }
  };

  const processSuccessfulPayment = async (
    paymentId: string,
    amountPaid: number,
    fullAmount: number
  ) => {
    try {
      const remainingBalance = fullAmount - amountPaid;

      // Save invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert([
          {
            subscription_id: subscriptionId,
            customer_name: subscription.name,
            customer_email: subscription.email,
            customer_phone: subscription.phone,
            total_amount: fullAmount,
            paid_amount: amountPaid,
            remaining_balance: remainingBalance,
            status: remainingBalance > 0 ? 'partial' : 'paid',
          },
        ])
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Save payment
      const { error: paymentError } = await supabase.from('payments').insert([
        {
          invoice_id: invoice.id,
          amount: amountPaid,
          status: 'completed',
          payment_method: 'razorpay',
          payment_id: paymentId,
          is_partial: remainingBalance > 0,
        },
      ]);

      if (paymentError) throw paymentError;

      // Generate Invoice PDF
      generateInvoicePDF(invoice);

      toast.success('Payment successful!');
      navigate(`/invoice/${invoice.id}`);
    } catch (error) {
      console.error(error);
      toast.error('Error saving payment.');
    }
  };

  const generateInvoicePDF = (invoice: any) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Invoice', 14, 20);

    doc.setFontSize(12);
    doc.text(`Invoice ID: ${invoice.id}`, 14, 30);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 36);
    doc.text(`Customer: ${invoice.customer_name}`, 14, 42);
    doc.text(`Email: ${invoice.customer_email}`, 14, 48);
    doc.text(`Phone: ${invoice.customer_phone}`, 14, 54);

    (doc as any).autoTable({
      startY: 70,
      head: [['Description', 'Amount (₹)']],
      body: [
        [subscription.plans?.name || 'Subscription Plan', subscription.plans?.price || 0],
        ['Discount', `- ${subscription.discount || 0}`],
        ['Total', invoice.total_amount],
        ['Amount Paid', invoice.paid_amount],
        [
          'Remaining Balance',
          invoice.remaining_balance > 0 ? invoice.remaining_balance : '0',
        ],
      ],
    });

    doc.save(`invoice_${invoice.id}.pdf`);
  };

  if (!subscription) return <p className="text-center mt-10">Loading subscription...</p>;

  const totals = {
    subtotal: subscription.plans?.price || 0,
    discount: subscription.discount || 0,
    total: (subscription.plans?.price || 0) - (subscription.discount || 0),
  };

  return (
    <div className="container mx-auto py-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Customer Details */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={subscription.name} disabled />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={subscription.email} disabled />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={subscription.phone} disabled />
          </div>
        </CardContent>
      </Card>

      {/* Right: Order Summary + Partial Payment */}
      <Card>
        <CardHeader>
          <CardTitle>Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>₹{totals.subtotal}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-₹{totals.discount}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>₹{totals.total}</span>
          </div>

          {/* ✅ Partial Payment Option */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="partial-payment"
                checked={isPartialPayment}
                onChange={(e) => setIsPartialPayment(e.target.checked)}
              />
              <Label htmlFor="partial-payment" className="text-sm">
                Pay Partially
              </Label>
            </div>

            {isPartialPayment && (
              <div>
                <Label htmlFor="partial-amount">Partial Amount</Label>
                <Input
                  id="partial-amount"
                  type="number"
                  placeholder="Enter amount to pay"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  min={500}
                  max={totals.total}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining balance will be ₹{totals.total - Number(partialAmount || 0)}
                </p>
              </div>
            )}
          </div>

          <Button
            onClick={handleProceedToPayment}
            disabled={loading}
            className="w-full mt-4"
          >
            {loading ? 'Processing...' : 'Proceed to Payment'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckoutPage;
