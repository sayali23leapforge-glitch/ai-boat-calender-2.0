import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();

    // Get document
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Update document status to processing
    await supabaseAdmin
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // For now, just mark as processed
    // TODO: Implement actual OCR/AI processing here
    await supabaseAdmin
      .from('documents')
      .update({ 
        status: 'processed',
        processed_at: new Date().toISOString()
      })
      .eq('id', documentId);

    return NextResponse.json({ 
      success: true,
      document: { ...document, status: 'processed' }
    });
  } catch (error: any) {
    console.error('Error processing document:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
