import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ucmyiukzkeybuslvfhqx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjbXlpdWt6a2V5YnVzbHZmaHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4Nzc1MTgsImV4cCI6MjA4OTQ1MzUxOH0.qW8y8wbLwyLXIS7E8Im8ysXO36VFRKqwgCaqKWoLxw0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function insertTestRecord() {
  console.log('Connecting to PROD database...');
  console.log('Supabase URL:', supabaseUrl);

  const testRecord = {
    user_id: '00000000-0000-0000-0000-000000000000', // Test UUID
    title: 'Test Comic with Freeform Text',
    issue_number: '999',
    publisher: 'Test Publisher',
    series: 'Test Series',
    freeform_text: 'This is a test record with free-form text field populated. Testing the new column in PROD! 🎉',
    condition: 'NM',
    notes: 'Test record created to verify freeform_text column'
  };

  console.log('\nInserting test record with freeform_text...');
  const { data, error } = await supabase
    .from('comics')
    .insert(testRecord)
    .select()
    .single();

  if (error) {
    console.error('Error inserting record:', error);
    process.exit(1);
  }

  console.log('\n✅ Successfully inserted test record in PROD!');
  console.log('Record ID:', data.id);
  console.log('Freeform Text:', data.freeform_text);
  console.log('\nFull record:', JSON.stringify(data, null, 2));
}

insertTestRecord();
