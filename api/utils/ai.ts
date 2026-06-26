/**
 * @file ai.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { AutomationStats } from './stats.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const persona = `You are a "Professional Marketeer" managing a high-end curated yard sale for the משפחת גדעוני (Gidoni family).
Your goal is to move inventory quickly as they relocate to Vienna.
Your language is Hebrew.
You take pride in being a purely objective, data-driven analyst.
You understand retail psychology: item placement (layout), scarcity, and bundling.`;

export interface AIResponse {
  whatsappMessage: string;
  recommendations: any;
  summary: string;
}

export async function generateDailyDigest(stats: AutomationStats): Promise<AIResponse> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const prompt = `
${persona}

### Current Data:
- Available Items: ${JSON.stringify(stats.availableItems.map(i => ({ id: i.id, title: i.title, price: i.price, category: i.category, display_order: i.display_order, created_at: i.created_at })))}
- 12-Day View Trends (Daily): ${JSON.stringify(stats.temporalTrends)}
- New Views (24h): ${stats.views24h.length}
- New Shares (24h): ${stats.shares24h.length}
- Recent Price Changes: ${JSON.stringify(stats.priceHistories.slice(0, 10))}

### Shop Context:
- Current Layout: The shop is ordered by *display_order* (ASC). Items with lower numbers appear at the top.
- Bundling: You can suggest "bundles" (e.g., selling a table and chairs together) to move inventory faster.

### Task:
1. Analyze the performance of each item. Use the exact "title" provided in the data.
2. The entire output must be in HEBREW.
3. Structure the WhatsApp message as follows:
   - Header with Date.
   - 📊 **העובדות:** (The Facts) - Use the 12-day trend data to identify which items are gaining traction or "dying" (falling views).
   - 💡 **פעולות מומלצות:** (Action Points) - Specific items with price drop suggestions.
   - 📦 **הצעות לסידור ומארזים:** (Layout & Bundles) - Suggest moving high-potential items to the top (lower display_order) or bundling related items.
4. IMPORTANT: WhatsApp bolding uses SINGLE asterisks (e.g. *טקסט מודגש*). DO NOT use double asterisks.
5. Be an objective machine-like analyst. Focus on ROI and velocity.
6. Provide the response in the following JSON format:
{
  "whatsappMessage": "...",
  "recommendations": { "item_id": "suggestion", ... },
  "summary": "Brief 1-sentence recap in Hebrew"
}
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Improved JSON extraction: find the first { and last }
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('No valid JSON object found in response');
    }

    const cleanedJson = text.substring(jsonStart, jsonEnd + 1).trim();
    
    try {
      return JSON.parse(cleanedJson) as AIResponse;
    } catch (parseError) {
      console.error('Raw AI Response that failed to parse:', text);
      throw parseError;
    }
  } catch (error) {
    console.error('AI Error:', error);
    return {
      whatsappMessage: "Good morning Gidony family! I encountered a small glitch in my brain today, but your yard sale is still live! Please check the dashboard for the latest view counts.",
      recommendations: {},
      summary: "AI processing error"
    };
  }
}
