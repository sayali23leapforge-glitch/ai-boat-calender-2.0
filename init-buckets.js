const fetch = require('node-fetch');

async function initializeBuckets() {
  try {
    console.log('Initializing storage buckets...');
    const response = await fetch('http://localhost:3000/api/storage/init-bucket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('Initialization response:', JSON.stringify(data, null, 2));
    
    if (data.status === 'success') {
      console.log('✅ Buckets initialized successfully!');
      console.log('Documents bucket:', data.results.documentsBucket.status);
      console.log('Images bucket:', data.results.imagesBucket.status);
    } else {
      console.log('❌ Initialization failed');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

initializeBuckets();
