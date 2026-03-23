import { NextRequest, NextResponse } from 'next/server';
import { imageProcessing } from '@/lib/image-processor';
import { getMessageService } from '@/lib/messaging/service-selector';

/**
 * API endpoint to process images from iMessage
 * Extracts dates and creates calendar events
 * POST /api/images/process
 */
export async function POST(req: NextRequest) {
  try {
    const {
      imageUrl,
      userId,
      conversationId,
      sender,
      createEvents = true,
    } = await req.json();

    if (!imageUrl || !userId) {
      return NextResponse.json(
        { error: 'imageUrl and userId are required' },
        { status: 400 }
      );
    }

    // Process the image
    const imageUpload = await imageProcessing.processImageMessage(
      imageUrl,
      userId,
      conversationId || 'unknown',
      sender || 'unknown'
    );

    let createdEventIds: string[] = [];

    // Optionally create calendar events from extracted data
    if (createEvents && imageUpload.extractedEvents.length > 0) {
      createdEventIds = await imageProcessing.createEventsFromImage(
        imageUpload,
        userId
      );
    }

    // Send summary via iMessage if conversationId provided
    if (conversationId) {
      const service = getMessageService();
      if (service.isConnected()) {
        const summary = `
📸 Image Processed!

📅 Dates found: ${imageUpload.extractedDates.length}
${imageUpload.extractedDates.map((d) => `  • ${d}`).join('\n')}

📝 Events: ${imageUpload.extractedEvents.length}
${imageUpload.extractedEvents
  .slice(0, 3)
  .map((e) => `  • ${e.title} - ${e.date}`)
  .join('\n')}

${createdEventIds.length > 0 ? `✓ Added ${createdEventIds.length} event(s) to calendar` : ''}
        `.trim();

        try {
          await service.sendMessage(
            conversationId,
            summary,
            'Calendar AI Assistant'
          );
        } catch (error) {
          console.warn('Could not send iMessage summary:', error);
        }
      }
    }

    return NextResponse.json({
      status: 'success',
      imageUpload,
      createdEventIds,
      message: `Image processed: ${imageUpload.extractedDates.length} date(s) found, ${createdEventIds.length} event(s) created`,
    });
  } catch (error) {
    console.error('Image processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for status
 */
export async function GET() {
  return NextResponse.json({
    status: 'success',
    message: 'Image processing service ready',
    endpoint: 'POST /api/images/process',
    bodyRequired: {
      imageUrl: 'string (URL to image)',
      userId: 'string',
      conversationId: 'string (optional)',
      sender: 'string (optional)',
      createEvents: 'boolean (optional, default: true)',
    },
  });
}
