export const GEMINI_MODEL = "gemini-3.8-flash";

const maximumGeminiRetries = 3;

export async function retryGeminiGeneration<T>(
  generate: () => Promise<T>,
): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await generate();
    } catch (error) {
      const status =
        error !== null && typeof error === "object" && "status" in error
          ? error.status
          : undefined;
      if (status !== 503 || retry >= maximumGeminiRetries) throw error;

      // Exponential backoff handles temporary Gemini API overload.
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * 2 ** retry),
      );
    }
  }
}
