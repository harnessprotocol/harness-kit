import { NextResponse } from "next/server";
import { signInWithGitHub } from "@/lib/auth";

export async function POST() {
  try {
    const url = await signInWithGitHub();

    if (!url) {
      return NextResponse.json(
        { error: "Failed to generate sign-in URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "Failed to initiate sign-in" },
      { status: 500 }
    );
  }
}
