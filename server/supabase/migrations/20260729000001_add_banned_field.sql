-- Add is_banned field to user_profiles for admin ban/deactivate functionality
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;

-- Update trigger function to include is_banned
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, is_banned)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''), FALSE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
