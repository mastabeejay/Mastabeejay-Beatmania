import { GeminiRateLimitedError } from "./Chatbot";

// Same client-side-key rationale as Chatbot.ts's own Gemini call — see that file's top comment.
// Image generation is a distinct model family from the text-chat model (Gemini's image-capable
// models, "Nano Banana", are not the same endpoint as gemini-3.1-flash-lite), so this has its own
// model constant rather than reusing Chatbot.ts's GEMINI_MODEL.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
const GEMINI_IMAGE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

/** Thrown when Gemini's quota is exhausted AND the free fallback (see below) also failed — the
 *  terminal "nothing left to try" state, distinct from GeminiRateLimitedError so the admin panel
 *  can show a message that doesn't falsely imply retrying Gemini alone would help. */
export class GraffitiGenerationExhaustedError extends Error {}

function buildGeminiPrompt(text: string): string {
  return (
    `Generate a single graffiti/street-art image. It must depict spray-painted graffiti lettering ` +
    `that spells out EXACTLY this text, with correct spelling and no extra or missing characters: "${text}". ` +
    `If the text is in Korean (Hangul), render those exact Hangul characters precisely — do not substitute, ` +
    `translate, or approximate them with different characters. Bold multi-color spray-paint style lettering, ` +
    `thick black outline/stroke, drips and overspray texture, on a brick or concrete wall background. ` +
    `Vibrant, high-contrast, urban street-art aesthetic. No other text, watermark, or caption anywhere in the image.`
  );
}

async function generateWithGemini(text: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  const response = await fetch(`${GEMINI_IMAGE_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildGeminiPrompt(text) }] }],
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

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}

// There is no free tier of OpenAI's own API — "ChatGPT" the consumer product has one, but its
// browser session isn't callable from here. Pollinations.ai (https://pollinations.ai) is used
// instead: a free, keyless image-generation proxy that (per its own docs, unverified against a
// live account from this environment) can route requests to OpenAI's image model via
// `model=openai`, which is the closest honest match to what was actually asked for. If that model
// name is wrong or removed, Pollinations falls back to its own default model rather than erroring
// — worst case this still produces *a* free graffiti image, just not specifically an OpenAI one.
const POLLINATIONS_ENDPOINT = "https://image.pollinations.ai/prompt";

function buildPollinationsPrompt(text: string): string {
  return (
    `Spray-painted graffiti street art spelling out the exact text "${text}" in bold multi-color ` +
    `spray-paint lettering with a thick black outline, drips and overspray texture, on a brick wall. ` +
    `Vibrant, high-contrast urban street-art style, no other text or watermark.`
  );
}

async function generateWithPollinations(text: string): Promise<string> {
  const prompt = encodeURIComponent(buildPollinationsPrompt(text));
  const response = await fetch(`${POLLINATIONS_ENDPOINT}/${prompt}?model=openai&width=1024&height=1024&nologo=true`);
  if (!response.ok) {
    throw new Error(`Pollinations image request failed: ${response.status}`);
  }
  const blob = await response.blob();
  return readBlobAsDataUrl(blob);
}

/** Generates the graffiti artwork, returned as a data: URL — the same base64-in-Postgres-text-
 *  column convention every other piece of binary content in this project already uses (banner
 *  images, profile photos, guestbook attachments), so it drops straight into
 *  site_notice.graffiti_image_data with no new storage mechanism.
 *
 *  Tries Gemini first; on a quota 429 specifically (not on a missing key or a malformed response —
 *  those are configuration bugs the admin should see directly), it retries once against the free
 *  Pollinations fallback above. Throws GraffitiGenerationExhaustedError only when both have failed;
 *  any other error (bad key, network failure, no image in the response) surfaces immediately since
 *  there's no "local" equivalent to degrade to — the existing CSS-styled text banner is the
 *  fallback, and it's already showing until the admin successfully generates and saves an image. */
export async function generateGraffitiImage(text: string): Promise<string> {
  try {
    return await generateWithGemini(text);
  } catch (err) {
    if (!(err instanceof GeminiRateLimitedError)) throw err;
    try {
      return await generateWithPollinations(text);
    } catch (fallbackErr) {
      throw new GraffitiGenerationExhaustedError(
        `Gemini 무료 한도 소진, 무료 대체 서비스도 실패: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
      );
    }
  }
}
