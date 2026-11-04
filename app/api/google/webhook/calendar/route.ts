import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessTokenFor } from "@/lib/google/tokens";
import { pullChanges, sameSecret } from "@/lib/google/sync";

/** O Google só avisa que algo mudou: o conteúdo vem de pullChanges. */
export async function POST(req: Request) {
  const id = req.headers.get("x-goog-channel-id") ?? "";
  const secret = req.headers.get("x-goog-channel-token") ?? "";
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 401 });

  const { data: channel } = await admin.from("calendar_channels").select("user_id,token").eq("channel_id", id).maybeSingle();
  if (!channel || !sameSecret(channel.token, secret)) return new NextResponse(null, { status: 401 });
  if (req.headers.get("x-goog-resource-state") === "sync") return new NextResponse(null, { status: 200 });

  const token = await accessTokenFor(channel.user_id);
  if (token) await pullChanges(token, channel.user_id).catch((e) => console.error(e));
  return new NextResponse(null, { status: 200 });
}
