/**
 * Test script to verify BlueBubbles-to-Calendar integration
 * This simulates an incoming message from BlueBubbles and checks if a calendar event is created
 */

import { parseMessageForEvent } from './lib/messaging/message-event-parser';
import { Message } from './lib/messaging/types';

async function testIntegration() {
  console.log('🧪 Testing BlueBubbles-to-Calendar Integration\n');

  // Test messages
  const testMessages: Message[] = [
    {
      id: 'test-msg-1',
      conversationId: 'conv-123',
      sender: 'John Doe',
      text: 'Meeting with team at 2pm tomorrow',
      timestamp: Date.now(),
      status: 'delivered',
    },
    {
      id: 'test-msg-2',
      conversationId: 'conv-123',
      sender: 'Jane Smith',
      text: 'Doctor appointment Friday 10am',
      timestamp: Date.now(),
      status: 'delivered',
    },
    {
      id: 'test-msg-3',
      conversationId: 'conv-123',
      sender: 'Bob Wilson',
      text: 'Hey how are you?',
      timestamp: Date.now(),
      status: 'delivered',
    },
  ];

  console.log('Testing messages:\n');
  for (const msg of testMessages) {
    console.log(`From: ${msg.sender}`);
    console.log(`Text: "${msg.text}"`);
    
    try {
      const result = await parseMessageForEvent(msg);
      console.log(`Result: ${result.success ? '✅ Event Created' : '❌ Not an Event'}`);
      console.log(`Message: ${result.message}`);
      if (result.parsed) {
        console.log(`Parsed as: ${result.parsed.type} - "${result.parsed.title}"`);
      }
    } catch (error) {
      console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    console.log('---\n');
  }

  console.log('✅ Integration test completed!');
}

// Run the test
testIntegration().catch(console.error);
