-- Add phone_number column to customers table
ALTER TABLE public.customers 
ADD COLUMN phone_number text;