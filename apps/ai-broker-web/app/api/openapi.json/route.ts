import { NextResponse } from "next/server";
import json from "@/content/docs/ai-broker-openapi.json";

export async function GET() {
  return NextResponse.json(json);
}
