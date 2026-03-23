/**
 * Image Processing & Upload Handler
 * Handles images sent via iMessage and extracts dates/information
 */

import { supabase } from './supabase';
import Anthropic from '@anthropic-ai/sdk';

export interface ImageUpload {
  id: string;
  userId: string;
  conversationId: string;
  sender: string;
  imageUrl: string;
  extractedText: string;
  extractedDates: string[];
  extractedEvents: Array<{
    title: string;
    date: string;
    description: string;
  }>;
  uploadedAt: number;
  processed: boolean;
}

class ImageProcessingService {
  /**
   * Process image from iMessage message
   * Extracts text, dates, and events from image
   */
  async processImageMessage(
    imageUrl: string,
    userId: string,
    conversationId: string,
    sender: string
  ): Promise<ImageUpload> {
    try {
      console.log('🖼️ Processing image from iMessage...');

      // Download image
      const imageBuffer = await this.downloadImage(imageUrl);
      const base64Image = imageBuffer.toString('base64');

      // Extract text and information using Claude Vision
      const extracted = await this.extractImageContent(base64Image);

      // Save to database
      const imageUpload = await this.saveImageUpload(
        userId,
        conversationId,
        sender,
        imageUrl,
        extracted
      );

      console.log(`✓ Image processed: ${extracted.dates.length} date(s) found`);

      return imageUpload;
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }

  /**
   * Download image from URL
   */
  private async downloadImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Extract text, dates, and events from image using Claude Vision
   */
  private async extractImageContent(base64Image: string): Promise<{
    text: string;
    dates: string[];
    events: Array<{ title: string; date: string; description: string }>;
  }> {
    const client = new Anthropic();

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Analyze this image and extract the following information in JSON format:
{
  "text": "all text visible in the image",
  "dates": ["list of dates found in format YYYY-MM-DD"],
  "events": [
    {
      "title": "event title",
      "date": "YYYY-MM-DD",
      "description": "description if any"
    }
  ]
}

Look for:
- Calendar dates
- Deadlines
- Meeting times
- Event information
- Any text that references when something should happen

Return ONLY valid JSON, no markdown or extra text.`,
            },
          ],
        },
      ],
    });

    try {
      const content = message.content[0];
      if (content.type === 'text') {
        return JSON.parse(content.text);
      }
      throw new Error('No text response from Claude');
    } catch (error) {
      console.error('Error parsing Claude response:', error);
      return {
        text: '',
        dates: [],
        events: [],
      };
    }
  }

  /**
   * Save image upload to database
   */
  private async saveImageUpload(
    userId: string,
    conversationId: string,
    sender: string,
    imageUrl: string,
    extracted: { text: string; dates: string[]; events: Array<any> }
  ): Promise<ImageUpload> {
    const imageUpload: ImageUpload = {
      id: `img_${Date.now()}`,
      userId,
      conversationId,
      sender,
      imageUrl,
      extractedText: extracted.text,
      extractedDates: extracted.dates,
      extractedEvents: extracted.events,
      uploadedAt: Date.now(),
      processed: true,
    };

    // Store in Supabase if table exists
    try {
      const { error } = await supabase.from('image_uploads').insert({
        id: imageUpload.id,
        user_id: userId,
        conversation_id: conversationId,
        sender,
        image_url: imageUrl,
        extracted_text: extracted.text,
        extracted_dates: extracted.dates,
        extracted_events: extracted.events,
        uploaded_at: new Date(imageUpload.uploadedAt),
        processed: true,
      });

      if (error) {
        console.warn('Could not save to database:', error);
      }
    } catch (error) {
      console.warn('Database save failed, continuing with in-memory:', error);
    }

    return imageUpload;
  }

  /**
   * Create calendar events from extracted image data
   */
  async createEventsFromImage(
    imageUpload: ImageUpload,
    userId: string
  ): Promise<string[]> {
    const createdEventIds: string[] = [];

    for (const event of imageUpload.extractedEvents) {
      try {
        const { data, error } = await supabase
          .from('calendar_events')
          .insert({
            user_id: userId,
            title: event.title,
            description: `From image: ${event.description || imageUpload.extractedText}`,
            start_time: new Date(event.date),
            end_time: new Date(new Date(event.date).getTime() + 3600000), // 1 hour duration
            source: 'image_extraction',
          })
          .select();

        if (!error && data) {
          createdEventIds.push(data[0].id);
          console.log(`✓ Created event: ${event.title}`);
        }
      } catch (err) {
        console.error(`Failed to create event ${event.title}:`, err);
      }
    }

    return createdEventIds;
  }
}

export const imageProcessing = new ImageProcessingService();
