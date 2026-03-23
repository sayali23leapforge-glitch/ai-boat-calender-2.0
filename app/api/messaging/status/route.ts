import { getMessageService } from '@/lib/messaging/service-selector';
import { NextResponse } from 'next/server';

/**
 * Diagnostic endpoint to check iMessage/BlueBubbles connection status
 */
export async function GET() {
  try {
    const service = getMessageService();
    
    const isConnected = service.isConnected();
    const baseUrl = process.env.NEXT_PUBLIC_BLUEBUBBLES_BASE_URL;
    const socketUrl = process.env.NEXT_PUBLIC_BLUEBUBBLES_SOCKET_URL;

    return NextResponse.json({
      status: 'success',
      messaging: {
        isConnected,
        baseUrl: baseUrl || 'NOT_CONFIGURED',
        socketUrl: socketUrl || 'NOT_CONFIGURED',
        connectionTime: new Date().toISOString(),
      },
      configuration: {
        bluebubbles: {
          configured: !!baseUrl && !!socketUrl,
          baseUrlPresent: !!baseUrl,
          socketUrlPresent: !!socketUrl,
        },
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      messaging: {
        isConnected: false,
      },
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const service = getMessageService();
    const body = await req.json();

    const action = body.action;

    if (action === 'initialize') {
      await service.initialize();
      return NextResponse.json({
        status: 'success',
        message: 'BlueBubbles service initialized',
        isConnected: service.isConnected(),
      });
    }

    if (action === 'disconnect') {
      await service.disconnect();
      return NextResponse.json({
        status: 'success',
        message: 'BlueBubbles service disconnected',
        isConnected: service.isConnected(),
      });
    }

    return NextResponse.json({
      status: 'error',
      message: 'Unknown action',
    }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

