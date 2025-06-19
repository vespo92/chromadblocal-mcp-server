#!/usr/bin/env node

import { ChromaClient, DefaultEmbeddingFunction } from 'chromadb';

async function setupCollections() {
  const client = new ChromaClient({
    path: process.env.CHROMA_URL || 'http://localhost:8001'
  });

  const collections = [
    { name: 'vinos_codebase', metadata: { description: 'General codebase context' } },
    { name: 'infrastructure_config', metadata: { description: 'Infrastructure configurations' } },
    { name: 'component_patterns', metadata: { description: 'Reusable component patterns' } },
    { name: 'api_documentation', metadata: { description: 'API endpoints and documentation' } },
    { name: 'troubleshooting', metadata: { description: 'Common issues and solutions' } }
  ];

  for (const collection of collections) {
    try {
      // Try to get the collection first
      await client.getCollection({ name: collection.name });
      console.log(`Collection ${collection.name} already exists`);
    } catch (error) {
      // If it doesn't exist, create it
      await client.createCollection({
        name: collection.name,
        metadata: collection.metadata,
        embeddingFunction: new DefaultEmbeddingFunction()
      });
      console.log(`Created collection: ${collection.name}`);
    }
  }

  // Add some initial context
  const codebaseCollection = await client.getCollection({ name: 'vinos_codebase' });
  
  await codebaseCollection.add({
    ids: ['claude_md'],
    documents: [`CLAUDE.md contains essential infrastructure context including:
- SSH configuration (always use username 'plowme')
- Kubernetes cluster details (control plane at 10.0.0.2)
- TrueNAS storage at 10.0.0.14
- MCP servers configuration
- Frontend development patterns with shadcn/ui`],
    metadatas: [{
      file: 'CLAUDE.md',
      type: 'documentation',
      importance: 'critical'
    }]
  });

  console.log('Initial context added to vinos_codebase collection');
}

setupCollections().catch(console.error);