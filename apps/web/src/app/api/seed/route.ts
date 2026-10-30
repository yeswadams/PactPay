export async function POST() {
  return Response.json(
    { error: "Use the local-only demo command to provision fixtures" },
    { status: 410 },
  );
}
