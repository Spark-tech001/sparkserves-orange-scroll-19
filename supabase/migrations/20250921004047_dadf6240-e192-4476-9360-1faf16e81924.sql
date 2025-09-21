-- Fix the search path for the generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  counter INTEGER;
  invoice_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-(\d+)') AS INTEGER)), 0) + 1
  INTO counter
  FROM public.invoices;
  
  invoice_num := 'INV-' || LPAD(counter::TEXT, 6, '0');
  RETURN invoice_num;
END;
$$;