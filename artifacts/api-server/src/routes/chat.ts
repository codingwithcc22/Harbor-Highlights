import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  GetCityGuideSystemPromptResponse,
  SendCityGuideMessageBody,
  SendCityGuideMessageResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  CITY_GUIDE_SYSTEM_PROMPT,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from "../city";

const router: IRouter = Router();
const DEFAULT_MODEL = "gemini-3.8-flash";

function getProviderStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}

router.get("/chat/system-prompt", (_req, res): void => {
  res.json(
    GetCityGuideSystemPromptResponse.parse({
      prompt: CITY_GUIDE_SYSTEM_PROMPT,
    }),
  );
});

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendCityGuideMessageBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn("Invalid city guide chat request");
    res.status(400).json({
      error:
        "Enter a message up to 2,000 characters and use settings within the listed ranges.",
    });
    return;
  }

  const message = parsed.data.message.trim();
  if (!message) {
    res.status(400).json({ error: "Enter a question for the city guide." });
    return;
  }

  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) {
    res.status(503).json({
      error: "Gemini is not configured. Add a GEMINI_API_KEY secret.",
    });
    return;
  }

  const requestedSettings = parsed.data.settings ?? {};
  const settings: ChatSettings = {
    temperature:
      requestedSettings.temperature ?? DEFAULT_CHAT_SETTINGS.temperature,
    topP: requestedSettings.topP ?? DEFAULT_CHAT_SETTINGS.topP,
    maxOutputTokens:
      requestedSettings.maxOutputTokens ??
      DEFAULT_CHAT_SETTINGS.maxOutputTokens,
  };
  const model = process.env["GEMINI_MODEL"]?.trim() || DEFAULT_MODEL;
  const history = (parsed.data.history ?? [])
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim(),
    }))
    .filter((entry) => entry.content.length > 0);

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 30_000 },
    });
    const generateResponse = () =>
      ai.models.generateContent({
      model,
      contents: [
        ...history.map((entry) => ({
          role: entry.role === "assistant" ? "model" : "user",
          parts: [{ text: entry.content }],
        })),
        { role: "user", parts: [{ text: message }] },
      ],
      config: {
        systemInstruction: CITY_GUIDE_SYSTEM_PROMPT,
        temperature: settings.temperature,
        topP: settings.topP,
        maxOutputTokens: settings.maxOutputTokens,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const response = await generateResponse().catch(async (error: unknown) => {
      if (getProviderStatus(error) !== 503) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return generateResponse();
    });

    const candidate = response.candidates?.[0];
    const usage = {
      promptTokenCount: response.usageMetadata?.promptTokenCount ?? 0,
      candidatesTokenCount: response.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokenCount: response.usageMetadata?.totalTokenCount ?? 0,
    };

    res.json(
      SendCityGuideMessageResponse.parse({
        reply:
          response.text?.trim() ||
          "I’m not sure about that one, neighbor. I can help with National Harbor’s food, waterfront, and Maryland details.",
        usage,
        settings,
        model,
        truncated:
          String(candidate?.finishReason ?? "").toUpperCase() ===
          "MAX_TOKENS",
      }),
    );
  } catch (error) {
    // Avoid logging provider messages because they can contain request details.
    const providerStatus = getProviderStatus(error);
    // The SDK aborts its fetch when the configured request timeout expires.
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    req.log.error(
      {
        errorType: error instanceof Error ? error.name : "UnknownError",
        providerStatus,
        model,
      },
      "City guide model request failed",
    );
    const errorMessage =
      timedOut
        ? "The city guide is taking too long to respond. Please try again."
        : providerStatus === 404
        ? "The configured Gemini model was not found. Check the GEMINI_MODEL secret."
        : providerStatus === 401 || providerStatus === 403
          ? "Gemini rejected the API key. Check the GEMINI_API_KEY secret."
          : providerStatus === 429
            ? "The city guide is busy right now. Please try again shortly."
            : providerStatus === 503
              ? "Gemini is temporarily unavailable. Please try again shortly."
            : "The city guide could not reach Gemini. Please try again.";
    res.status(timedOut ? 504 : 502).json({ error: errorMessage });
  }
});

export default router;
