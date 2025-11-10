// proxy.ts — Next.js 16 "proxy" (replaces deprecated middleware)
// Guards ONLY /dashboard. Never intercepts /api/*.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  // Protect only the dashboard pages
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            // Read incoming cookies from the request
            return req.cookies.getAll();
          },
          setAll(cookies) {
            // Write updated cookies onto the response
            for (const { name, value, options } of cookies) {
              res.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const to = new URL('/login', req.url);
      to.searchParams.set('redirectedFrom', req.nextUrl.pathname);
      return NextResponse.redirect(to);
    }
  }

  return res;
}
