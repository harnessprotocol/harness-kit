import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export async function POST() {
  try {
    await signOut();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to sign out" },
      { status: 500 }
    );
  }
}
