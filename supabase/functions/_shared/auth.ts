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
 * Standard error response type
 */
export interface ErrorResponse {
  error: string;
  details?: string;
}

/**
 * Creates a standardized JSON error response with proper CORS headers
 *
 * @param message - The error message to return
 * @param status - HTTP status code (default: 500)
 * @param details - Optional additional error details
 * @returns Response object with JSON error and CORS headers
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  details?: string
): Response {
  const body: ErrorResponse = { error: message };
  if (details) {
    body.details = details;
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Creates a standardized JSON success response with proper CORS headers
 *
 * @param data - The data to return
 * @param status - HTTP status code (default: 200)
 * @returns Response object with JSON data and CORS headers
 */
export function createSuccessResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Wraps an Edge Function handler with standardized error handling.
 * Properly catches Response objects thrown by auth helpers and converts
 * unexpected errors into proper JSON responses.
 *
 * IMPORTANT: This wrapper ensures that:
 * 1. Response objects from auth helpers are returned directly
 * 2. Error objects are converted to JSON responses
 * 3. Unknown errors are logged and converted to 500 responses
 * 4. All responses include proper CORS headers
 *
 * @param handler - The async function to wrap
 * @returns Wrapped handler with error handling
 *
 * @example
 * ```typescript
 * Deno.serve(
 *   wrapHandler(async (req) => {
 *     const { userClient } = await requireAuth(req);
 *     return createSuccessResponse({ message: "Success" });
 *   })
 * );
 * ```
 */
export function wrapHandler(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      console.error("Unexpected error in Edge Function:", error);

      if (error instanceof Error) {
        return createErrorResponse(error.message, 500);
      }

      return createErrorResponse("Internal server error", 500);
    }
  };
}

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
 * Standard authentication result with both user and service clients
 */
export interface AuthWithServiceResult {
  user: {
    id: string;
    email?: string;
  };
  userClient: SupabaseClient;
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
 * Validates the incoming request has a valid JWT token and returns both clients.
 * This is a convenience function that provides both user and service clients
 * for authenticated operations that may need elevated privileges.
 *
 * Use this when:
 * - User needs to perform operations on their own data (use userClient)
 * - May occasionally need service-level operations (use serviceClient)
 *
 * Note: This does NOT check for admin privileges. Use requireAdmin() for that.
 *
 * @param req - The incoming request
 * @returns User, user-scoped client, and service client
 * @throws Response with 401 if authentication fails
 */
export async function requireAuth(req: Request): Promise<AuthWithServiceResult> {
  const { user, userClient } = await requireUser(req);

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
