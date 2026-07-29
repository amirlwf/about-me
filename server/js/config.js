// ============================================================
// Supabase Configuration
// ============================================================
// Replace these values with your actual Supabase project credentials
export const SUPABASE_URL = "https://wgczmjrmrgqdqlroozrq.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnY3ptanJtcmdxZHFscm9venJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMDU1OTAsImV4cCI6MjEwMDg4MTU5MH0.xuFyoxAFE_t8fHwCizbF_8hWo8QIUrMyRMuww81XQ_E";

// Edge Function URLs
export const FUNCTION_URLS = {
  verifyEntryCode: `${SUPABASE_URL}/functions/v1/verify-entry-code`,
  assignConfig: `${SUPABASE_URL}/functions/v1/assign-config`,
  adminLogin: `${SUPABASE_URL}/functions/v1/admin-login`,
  adminAddConfigs: `${SUPABASE_URL}/functions/v1/admin-add-configs`,
  adminActivateCode: `${SUPABASE_URL}/functions/v1/admin-activate-code`,
  adminGetUsers: `${SUPABASE_URL}/functions/v1/admin-get-users`,
  adminUploadVideo: `${SUPABASE_URL}/functions/v1/admin-upload-video`,
  adminChangePassword: `${SUPABASE_URL}/functions/v1/admin-change-password`,
  adminResetUserPassword: `${SUPABASE_URL}/functions/v1/admin-reset-user-password`,
};
