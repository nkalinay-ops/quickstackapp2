import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

/**
 * Standard CORS headers for all Edge Functions
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Enhanced CORS headers with credentials support for admin functions
 */
export const getCorsHeaders = (origin: string | null) => {
  const isOriginAllowed = (origin: string | null): boolean => {
    if (!origin) return false;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const allowedOrigins = [
      supabaseUrl,
      "http://localhost:5173",
      "http://localhost:3000",
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) return true;
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('webcontainer')) return true;
    if (origin.includes('.vercel.app') || origin.includes('.netlify.app')) return true;

    return false;
  };

  const isAllowed = isOriginAllowed(origin);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : (supabaseUrl || "*"),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Access-Control-Allow-Credentials": "true",
  };
};

/**
 * User authentication result
 */
export interface AuthResult {
  user: {
    id: string;
    email?: string;
  };
  userClient: SupabaseClient;
}

/**
 * Admin authentication result with service client
 */
export interface AdminAuthResult extends AuthResult {
  serviceClient: SupabaseClient;
}

/**
 * Validates the incoming request has a valid JWT token and returns the authenticated user.
 * Uses the two-client pattern: validates with ANON_KEY client, not SERVICE_ROLE_KEY.
 *
 * @param req - The incoming request
 * @returns User and user-scoped client for RLS-enabled queries
 * @throws Response with 401 if authentication fails
 */
export async function requireUser(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    throw new Response(
      JSON.stringify({ error: "Missing authorization header" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Create user-scoped client with ANON_KEY and Authorization header
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Validate the JWT token
  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    throw new Response(
      JSON.stringify({
        error: "Unauthorized",
        details: authError?.message || "Invalid or expired token",
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return {
    user,
    userClient,
  };
}

/**
 * Validates the incoming request has a valid JWT token and the user has admin privileges.
 * Uses the two-client pattern:
 * 1. Validates JWT with ANON_KEY client
 * 2. Checks admin status using user-scoped client (respects RLS)
 * 3. Returns service client for privileged operations
 *
 * @param req - The incoming request
 * @returns User, user-scoped client, and service client for admin operations
 * @throws Response with 401 if authentication fails or 403 if not admin
 */
export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  // First, validate the user
  const { user, userClient } = await requireUser(req);

  // Check admin status using user-scoped client (respects RLS policies)
  const { data: profile, error: profileError } = await userClient
    .from("user_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Response(
      JSON.stringify({ error: `Profile error: ${profileError.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (!profile) {
    throw new Response(
      JSON.stringify({ error: "User profile not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (!profile.is_admin) {
    throw new Response(
      JSON.stringify({ error: "Forbidden: Admin access required" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Only NOW create the service client for privileged operations
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return {
    user,
    userClient,
    serviceClient,
  };
}

/**
 * Validates the incoming request has a valid JWT token and the user has bulk upload permission.
 *
 * @param req - The incoming request
 * @returns User and user-scoped client
 * @throws Response with 401 if authentication fails or 403 if permission denied
 */
export async function requireBulkUploadPermission(req: Request): Promise<AuthResult> {
  // First, validate the user
  const { user, userClient } = await requireUser(req);

  // Check bulk upload permission using user-scoped client
  const { data: profile, error: profileError } = await userClient
    .from("user_profiles")
    .select("can_bulk_upload")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Response(
      JSON.stringify({ error: `Profile error: ${profileError.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (!profile) {
    throw new Response(
      JSON.stringify({ error: "User profile not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (!profile.can_bulk_upload) {
    throw new Response(
      JSON.stringify({ error: "Forbidden: Bulk upload permission required" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return {
    user,
    userClient,
  };
}
