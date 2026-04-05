import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const summarizeContent = async (content: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Summarize the following blog post content in a concise TL;DR paragraph:\n\n${content}`,
  });
  return response.text;
};

export const improveWriting = async (content: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Improve the grammar, flow, and professional tone of the following blog post content while keeping its original meaning. Return only the improved text:\n\n${content}`,
  });
  return response.text;
};

export const suggestTags = async (title: string, content: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the title "${title}" and the content below, suggest 5 relevant tags for this blog post. Return them as a comma-separated list:\n\n${content}`,
  });
  return response.text;
};

export const suggestTitles = async (content: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the following content, suggest 3 catchy and professional titles for this blog post. Return them as a comma-separated list:\n\n${content}`,
  });
  return response.text;
};

export const generateCoverImage = async (title: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: `A high-quality, artistic, and modern digital illustration for a blog post titled "${title}". The style should be clean, professional, and visually striking, suitable for a premium blogging platform.`,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};
