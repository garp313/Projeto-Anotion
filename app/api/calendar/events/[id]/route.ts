import { NextResponse, type NextRequest } from "next/server";
import { calendarError, google, toGoogleEvent, type EventInput } from "@/lib/google/calendar";

type Ctx = { params: Promise<{ id: string }> };

const path = (calendarId: string, id: string) =>
  `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`;

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { calendarId = "primary", ...input } = (await req.json()) as EventInput & { calendarId?: string };
  try {
    const qs = input.attendees?.length ? "?sendUpdates=all" : "";
    return NextResponse.json(await google(`${path(calendarId, id)}${qs}`, { method: "PATCH", body: JSON.stringify(toGoogleEvent(input)) }));
  } catch (e) {
    return calendarError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const calendarId = new URL(req.url).searchParams.get("calendarId") ?? "primary";
  try {
    await google(path(calendarId, id), { method: "DELETE" });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return calendarError(e);
  }
}
