#!/usr/bin/env node

import { ChromaClient } from 'chromadb';

async function testChroma() {
  const client = new ChromaClient({
    path: 'http://localhost:8001'
  });

  try {
    // List collections
    console.log('Listing collections...');
    const collections = await client.listCollections();
    console.log('Collections:', collections);

    // Create or get a test collection
    let collection;
    try {
      collection = await client.getCollection({ name: 'test_collection' });
      console.log('Got existing test collection');
    } catch (e) {
      collection = await client.createCollection({ 
        name: 'test_collection',
        metadata: { description: 'Test collection for MCP' }
      });
      console.log('Created test collection');
    }

    // Test adding a document (without embeddings - ChromaDB will generate them)
    console.log('\nAdding test document...');
    await collection.add({
      ids: ['test1'],
      documents: ['This is a test document for ChromaDB MCP integration'],
      metadatas: [{ source: 'test', type: 'document' }]
    });
    console.log('Document added successfully');

    // Test querying
    console.log('\nQuerying for similar documents...');
    const results = await collection.query({
      queryTexts: ['MCP integration'],
      nResults: 1
    });
    console.log('Query results:', JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testChroma();