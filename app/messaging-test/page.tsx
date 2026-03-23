/**
 * Test page to check BlueBubbles/iMessage connection
 */
'use client';

import { useMessaging } from '@/hooks/use-messaging';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export default function MessagingTestPage() {
  const { connected, loading, error, conversations, fetchConversations } = useMessaging();
  const [statusText, setStatusText] = useState('Initializing...');
  const [loadingConvs, setLoadingConvs] = useState(false);

  useEffect(() => {
    if (loading) {
      setStatusText('Connecting to BlueBubbles & iMessage...');
    } else if (connected) {
      setStatusText('✓ Connected to iMessage via BlueBubbles');
    } else if (error) {
      setStatusText(`✗ Connection Error: ${error}`);
    } else {
      setStatusText('Not connected');
    }
  }, [connected, loading, error]);

  const handleLoadConversations = async () => {
    try {
      setLoadingConvs(true);
      await fetchConversations();
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">iMessage Connection Status</h1>
        
        <div className={`p-4 rounded-lg mb-4 ${
          connected 
            ? 'bg-green-50 border border-green-200' 
            : error 
            ? 'bg-red-50 border border-red-200' 
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className={`text-lg font-semibold ${
            connected 
              ? 'text-green-700' 
              : error 
              ? 'text-red-700' 
              : 'text-gray-700'
          }`}>
            {statusText}
          </div>
        </div>

        <div className="space-y-2 text-sm text-gray-600 mb-4">
          <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
          <p><strong>Connected:</strong> {connected ? '✓ Yes' : '✗ No'}</p>
          {error && <p className="text-red-600"><strong>Error:</strong> {error}</p>}
          {!loading && <p><strong>Conversations Loaded:</strong> {conversations.length}</p>}
        </div>

        {connected && conversations.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm font-semibold mb-2">iMessage Conversations:</p>
            <ul className="text-xs space-y-1">
              {conversations.slice(0, 5).map((conv) => (
                <li key={conv.id} className="text-gray-700">
                  • {conv.displayName || conv.participants.slice(0, 2).join(', ')}
                  {conv.participants.length > 2 && ` +${conv.participants.length - 2}`}
                </li>
              ))}
              {conversations.length > 5 && (
                <li className="text-gray-700 italic">+{conversations.length - 5} more</li>
              )}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button 
            onClick={handleLoadConversations}
            className="flex-1"
            disabled={!connected || loadingConvs}
          >
            {loadingConvs ? 'Loading...' : 'Load Conversations'}
          </Button>
          <Button 
            onClick={() => window.location.reload()}
            variant="outline"
            className="flex-1"
          >
            Retry
          </Button>
        </div>

        <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono overflow-auto max-h-40 text-gray-700">
          <p className="font-semibold mb-2">📋 Debug Info:</p>
          <p>Server: {process.env.NEXT_PUBLIC_BLUEBUBBLES_BASE_URL}</p>
          <p className="break-all">Socket: {process.env.NEXT_PUBLIC_BLUEBUBBLES_SOCKET_URL}</p>
          <p className="mt-2 text-gray-600">Check browser console (F12) for connection logs</p>
        </div>
      </div>
    </div>
  );
}
