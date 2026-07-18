import { GeminiRateLimitedError } from "./Chatbot";

// Same client-side-key rationale as Chatbot.ts's own Gemini call — see that file's top comment.
// Image generation is a distinct model family from the text-chat model (Gemini's image-capable
// models, "Nano Banana", are not the same endpoint as gemini-3.1-flash-lite), so this has its own
// model constant rather than reusing Chatbot.ts's GEMINI_MODEL.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const GEMINI_IMAGE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

function buildPrompt(text: string): string {
  return (
    `Generate a single graffiti/street-art image. It must depict spray-painted graffiti lettering ` +
    `that spells out EXACTLY this text, with correct spelling and no extra or missing characters: "${text}". ` +
    `If the text is in Korean (Hangul), render those exact Hangul characters precisely — do not substitute, ` +
    `translate, or approximate them with different characters. Bold multi-color spray-paint style lettering, ` +
    `thick black outline/stroke, drips and overspray texture, on a brick or concrete wall background. ` +
    `Vibrant, high-contrast, urban street-art aesthetic. No other text, watermark, or caption anywhere in the image.`
  );
}

/** Calls Gemini's image-generation model with a graffiti-styled prompt built from the admin's own
 *  tag text and returns the result as a data: URL — the same base64-in-Postgres-text-column
 *  convention every other piece of binary content in this project already uses (banner images,
 *  profile photos, guestbook attachments), so it drops straight into site_notice.graffiti_image_data
 *  with no new storage mechanism.
 *
 *  Throws GeminiRateLimitedError on a 429 and a plain Error for everything else (missing key,
 *  network failure, no image in the response) — the caller shows this directly as a graffiti-
 *  generation error rather than silently falling back, since (unlike the chatbot) there's no
 *  "local" equivalent to degrade to; the existing CSS-styled text banner is the fallback, and it's
 *  already showing until the admin successfully generates and saves an image. */
export async function generateGraffitiImage(text: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  const response = await fetch(`${GEMINI_IMAGE_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(text) }] }],
    }),
  });

  if (response.status === 429) {
    throw new GeminiRateLimitedError("Gemini free-tier quota exhausted");
  }
  if (!response.ok) {
    throw new Error(`Gemini image request failed: ${response.status}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts as { inlineData?: { data?: string; mimeType?: string } }[] | undefined;
  const imagePart = parts?.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini response had no image");
  }
  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}
