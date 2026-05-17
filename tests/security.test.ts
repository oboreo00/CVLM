import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// Polyfill WebSocket for Node.js environment
(globalThis as any).WebSocket = WebSocket;

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runSecurityTests() {
  console.log('🚀 Starting Security & RLS Validation Tests...\n');

  let testsPassed = 0;
  let totalTests = 2;

  // TEST 1: Unauthenticated Bot Access
  try {
    console.log('Test 1: Unauthenticated Bot Access');
    const { data, error } = await supabase.from('query_logs').select('*').limit(1);
    
    if (error) {
      console.log('  ❌ Error during query:', error.message);
    } else if (data && data.length > 0) {
      console.error('  ❌ FAILURE: Unauthenticated bot was able to see data!');
    } else {
      console.log('  ✅ SUCCESS: Bot cannot see any logs.');
      testsPassed++;
    }
  } catch (err) {
    console.error('  ❌ Test 1 crashed:', err);
  }

  console.log('');

  // TEST 2: Authenticated User Isolation
  try {
    console.log('Test 2: Authenticated User Isolation');
    const { data: { user }, error: authErr } = await supabase.auth.signInAnonymously();
    
    if (authErr || !user) {
      console.error('  ❌ Auth Error:', authErr?.message);
    } else {
      console.log(`  Authenticated as: ${user.id}`);
      
      // Try to insert a private log
      const testQuestion = `Security Test ${Date.now()}`;
      const { error: insErr } = await supabase.from('query_logs').insert({
        question: testQuestion,
        query_mode: 'session',
        user_id: user.id,
        total_duration_ms: 0
      });

      if (insErr) {
        console.error('  ❌ Insert Error:', insErr.message);
      } else {
        // Try to read it back
        const { data, error: selErr } = await supabase
          .from('query_logs')
          .select('*')
          .eq('question', testQuestion);

        if (selErr) {
          console.error('  ❌ Selection Error:', selErr.message);
        } else if (data && data.length === 1 && data[0].user_id === user.id) {
          console.log('  ✅ SUCCESS: User can see their own data.');
          testsPassed++;
        } else {
          console.error('  ❌ FAILURE: Data mismatch or not found.');
        }
      }
    }
  } catch (err) {
    console.error('  ❌ Test 2 crashed:', err);
  }

  console.log('\n--- Test Summary ---');
  console.log(`${testsPassed}/${totalTests} tests passed.`);

  if (testsPassed === totalTests) {
    console.log('🎉 System is secure!');
    process.exit(0);
  } else {
    console.log('⚠️ Security vulnerabilities detected!');
    process.exit(1);
  }
}

runSecurityTests();
