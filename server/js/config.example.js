// ============================================================
// Supabase Configuration - COPY THIS FILE TO config.js
// ============================================================
// Replace these values with your actual Supabase project credentials
export const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

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
  adminGetVideos: `${SUPABASE_URL}/functions/v1/admin-get-videos`,
  adminDeleteUser: `${SUPABASE_URL}/functions/v1/admin-delete-user`,
  adminBanUser: `${SUPABASE_URL}/functions/v1/admin-ban-user`,
  adminDeleteVideo: `${SUPABASE_URL}/functions/v1/admin-delete-video`,
  adminGetPacks: `${SUPABASE_URL}/functions/v1/admin-get-packs`,
  adminReassignPack: `${SUPABASE_URL}/functions/v1/admin-reassign-pack`,
  adminUpdatePackConfigs: `${SUPABASE_URL}/functions/v1/admin-update-pack-configs`,
  adminGetPackConfigs: `${SUPABASE_URL}/functions/v1/admin-get-pack-configs`,
  adminDeletePack: `${SUPABASE_URL}/functions/v1/admin-delete-pack`,
  adminUnassignPack: `${SUPABASE_URL}/functions/v1/admin-unassign-pack`,
  adminGetEntryCodes: `${SUPABASE_URL}/functions/v1/admin-get-entry-codes`,
  adminGetSessions: `${SUPABASE_URL}/functions/v1/admin-get-sessions`,
  adminTerminateSession: `${SUPABASE_URL}/functions/v1/admin-terminate-session`,
};
