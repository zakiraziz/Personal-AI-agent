import "server-only";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await openai.createImage({
      prompt: prompt,
      model: "dall-e-3",
      size: "1024x1024",
      quality: "standard",
    });

    const imageUrl = response.data.data[0].url;

    return new Response(JSON.stringify({ imageUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DALL-E generation error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate thumbnail" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

  if (!isRecord(body)) {
    return jsonError("Enter a valid story title or topic.", 400);
  }

  const { topic } = body as { topic: string };

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    return jsonError("A story title or topic is required.", 400);
  }

  if (topic.length > 200) {
    return jsonError("The topic must be 200 characters or less.", 400);
  }

  // Use the retry logic for Gemini API calls
  const generatePrompt = async (): Promise<string> => {
    const client = new GoogleGenAI();

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${thumbnailSystemInstruction}

      Topic: "${topic.trim()}"
      
      Generate a highly detailed, descriptive image prompt for a cartoon-style thumbnail.
      Return ONLY the prompt text, no additional text or explanation.`,
    });

    if (!response || !response.text) {
      throw new Error("No response from Gemini AI");
    }

    return response.text.trim();
  };

  try {
    const prompt = await retryGeminiGeneration(generatePrompt);

    // Save the generated prompt to the database
    const supabase = await createClient();
    const { data: user, error: userError } = await supabase.auth.getUser();

    if (userError || !user.user) {
      return jsonError("Could not authenticate user.", 401);
    }

    const { error: dbError } = await supabase
      .from("thumbnail_prompts")
      .insert({
        owner_id: user.user.id,
        prompt_text: prompt,
      });

    if (dbError) {
      console.error("Error saving thumbnail prompt:", dbError);
      // Continue even if save fails - we still return the prompt
    }

    return NextResponse.json({ prompt });
  } catch (error: any) {
    console.error("Gemini generation error:", error);

    // Check if it's a 503 error or other recoverable error
    const status =
      error !== null && typeof error === "object" && "status" in error
        ? error.status
        : undefined;

    if (status === 503) {
      return NextResponse.json(
        { error: "Gemini API is temporarily overloaded. Please try again." },
        { status: 503 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message ?? "An unexpected error occurred." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}