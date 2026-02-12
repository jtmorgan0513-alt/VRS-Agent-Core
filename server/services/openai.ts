import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o-mini" which is cost-effective for text enhancement
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ENHANCE_PROMPT = `You are a Sears appliance repair documentation assistant. Improve this technician's issue description for clarity and readability WITHOUT changing any of the content or meaning.

Your job is to:
- Break up long run-on sentences
- Organize the information in a logical, easy-to-scan format
- Fix spelling and grammar
- Elaborate slightly where helpful for clarity
- Keep all technical details, part numbers, and observations exactly as stated

Format the response as:
**Symptom:** [Customer's reported issue]
**Diagnosis:** [What the technician found]
**Repair Needed:** [Recommended parts/service]

Do NOT add information that wasn't in the original. Only clarify and reorganize.

Respond with JSON in this format: { "enhanced": "the improved description" }

Appliance Type: {applianceType}
Original Description: {description}`;

const rateLimitMap = new Map<number, { count: number; resetAt: number }>();

export function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) {
    return false;
  }
  entry.count++;
  return true;
}

export async function enhanceDescription(
  description: string,
  applianceType: string
): Promise<string> {
  const prompt = ENHANCE_PROMPT
    .replace("{applianceType}", applianceType)
    .replace("{description}", description);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from AI");

  const parsed = JSON.parse(content);
  const enhanced = parsed.enhanced;
  if (typeof enhanced === "string") {
    return enhanced;
  }
  if (typeof enhanced === "object" && enhanced !== null) {
    return Object.entries(enhanced)
      .map(([key, val]) => `**${key}:** ${val}`)
      .join("\n\n");
  }
  return content;
}
