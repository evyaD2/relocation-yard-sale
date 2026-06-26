/**
 * @file trigger-local-digest.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

/**
 * Trigger Local Digest
 * 
 * Usage: node --env-file=.env.local scripts/trigger-local-digest.js
 * 
 * This script manually invokes the local API function to test the 
 * entire flow (Supabase -> Gemini -> Twilio).
 */

import handler from '../api/daily-digest.ts';

// Mock Request and Response for local testing
const mockReq = {
  headers: {
    'authorization': `Bearer ${process.env.CRON_SECRET}`
  }
};

const mockRes = {
  status: (code) => {
    console.log(`Response Status: ${code}`);
    return mockRes;
  },
  json: (data) => {
    console.log('Response Data:', JSON.stringify(data, null, 2));
    return mockRes;
  }
};

console.log('🚀 Triggering Daily Digest locally...');
console.log('Using Cron Secret:', process.env.CRON_SECRET ? 'MATCHED' : 'MISSING');

handler(mockReq, mockRes).catch(err => {
  console.error('Fatal Test Error:', err);
});
