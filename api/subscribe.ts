import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const API_KEY = process.env.MAILCHIMP_API_KEY;
  const LIST_ID = process.env.MAILCHIMP_LIST_ID;
  const SERVER_PREFIX = process.env.MAILCHIMP_SERVER_PREFIX;

  if (!API_KEY || !LIST_ID || !SERVER_PREFIX) {
    // In development, simulate success if keys are missing
    console.warn("Mailchimp credentials missing. Simulating success.");
    return res.status(200).json({ message: "Simulated subscription success" });
  }

  try {
    const response = await fetch(
      `https://${SERVER_PREFIX}.api.mailchimp.com/3.0/lists/${LIST_ID}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
        },
        body: JSON.stringify({
          email_address: email,
          status: "subscribed",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      if (data.title === "Member Exists") {
        return res.status(400).json({ error: "You are already subscribed!" });
      }
      throw new Error(data.detail || "Failed to subscribe");
    }

    res.status(200).json({ message: "Successfully subscribed!" });
  } catch (error: any) {
    console.error("Newsletter subscription error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
