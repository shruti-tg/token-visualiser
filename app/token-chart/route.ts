import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "public", "tokens.html");
    const content = await readFile(filePath, "utf-8");

    return new Response(content, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return new Response("Not found", { status: 404 });
  }
}
