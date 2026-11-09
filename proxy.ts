import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  getSupabaseConfig,
  isAuthorizedEmail,
  isAppConfigured,
} from "@/lib/supabase/config";

const publicPaths = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
]);

function isInvalidRefreshTokenError(error: { message: string } | null) {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found")
  );
}

function clearSupabaseAuthCookies(
  response: NextResponse,
  request: NextRequest,
) {
  for (const { name } of request.cookies.getAll()) {
    if (!/^sb-.+-auth-token(?:\.\d+)?$/.test(name)) continue;
    response.cookies.set(name, "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

export async function proxy(request: NextRequest) {
  const isPublicPath = publicPaths.has(request.nextUrl.pathname);
  if (!isAppConfigured()) {
    if (isPublicPath) return NextResponse.next();
    return NextResponse.redirect(new URL("/login?setup=1", request.url));
  }

  const { url, key } = getSupabaseConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user: authenticatedUser },
    error,
  } = await supabase.auth.getUser();
  let user = authenticatedUser;

  if (isInvalidRefreshTokenError(error)) {
    user = null;
    clearSupabaseAuthCookies(response, request);
  }

  if (error && error.name !== "AuthSessionMissingError") {
    if (isInvalidRefreshTokenError(error)) {
      console.warn(
        "Discarding a stale Supabase session after an invalid refresh token.",
      );
    } else if (error.name === "AuthRetryableFetchError") {
      console.error(
        `Could not verify the current session because Supabase is temporarily unavailable: ${error.message}`,
      );
      if (isPublicPath) return response;

      const loginUrl = new URL("/login?auth=unavailable", request.url);
      const redirect = NextResponse.redirect(loginUrl);
      for (const cookie of response.cookies.getAll()) {
        redirect.cookies.set(cookie);
      }
      return redirect;
    } else {
      throw new Error(`Could not verify the current session: ${error.message}`);
    }
  }

  if (user && !isAuthorizedEmail(user.email)) {
    await supabase.auth.signOut({ scope: "local" });
    const redirect = NextResponse.redirect(
      new URL("/login?unauthorized=1", request.url),
    );
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  if (
    user &&
    ["/login", "/register", "/forgot-password"].includes(
      request.nextUrl.pathname,
    )
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
