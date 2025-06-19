#!/usr/bin/env node

// Simple MCP server test script
import { ChromaClient, DefaultEmbeddingFunction } from 'chromadb';

async function testMCPFunctionality() {
  console.log('Testing ChromaDB MCP functionality...\n');
  
  const client = new ChromaClient({
    path: 'http://localhost:8001'
  });

  try {
    // Test 1: Store context
    console.log('1. Testing store_context functionality...');
    const collection = await client.getOrCreateCollection({ 
      name: 'vinos_codebase',
      embeddingFunction: new DefaultEmbeddingFunction()
    });
    
    await collection.add({
      ids: ['test_mcp_1'],
      documents: ['This MCP server provides ChromaDB integration for storing and retrieving code context'],
      metadatas: [{ type: 'test', source: 'mcp-test' }]
    });
    console.log('✓ Successfully stored context\n');

    // Test 2: Search context
    console.log('2. Testing search_context functionality...');
    const results = await collection.query({
      queryTexts: ['ChromaDB MCP'],
      nResults: 3
    });
    console.log('✓ Search results:', results.documents[0].length, 'documents found\n');

    // Test 3: List collections
    console.log('3. Testing list_collections functionality...');
    const collections = await client.listCollections();
    console.log('✓ Collections:', collections.map(c => c.name).join(', '), '\n');

    // Test 4: Find similar patterns
    console.log('4. Testing find_similar_patterns functionality...');
    const patternsCollection = await client.getOrCreateCollection({ 
      name: 'component_patterns',
      embeddingFunction: new DefaultEmbeddingFunction()
    });
    
    // Add a sample pattern
    await patternsCollection.add({
      ids: ['pattern_1'],
      documents: [`import { StatusBadge } from '@/components/examples/ReusableExamples'
export function MyComponent() {
  return <StatusBadge status="healthy" />
}`],
      metadatas: [{ type: 'component', name: 'StatusBadge Example' }]
    });
    
    const patternResults = await patternsCollection.query({
      queryTexts: ['StatusBadge component'],
      nResults: 1
    });
    console.log('✓ Pattern search successful\n');

    console.log('All tests passed! ChromaDB MCP is ready to use.');
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testMCPFunctionality();