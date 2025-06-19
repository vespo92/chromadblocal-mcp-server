#!/usr/bin/env node

import { ChromaClient, DefaultEmbeddingFunction } from 'chromadb';

async function setupHomeCollections() {
  const client = new ChromaClient({
    path: process.env.CHROMADB_URL || 'http://localhost:8001'
  });

  const collections = [
    { name: 'home_automation', metadata: { description: 'Smart home configurations and automations' } },
    { name: 'code_snippets', metadata: { description: 'Reusable code patterns and snippets' } },
    { name: 'configurations', metadata: { description: 'System and application configurations' } },
    { name: 'troubleshooting', metadata: { description: 'Solutions to problems encountered' } },
    { name: 'project_docs', metadata: { description: 'Documentation for personal projects' } },
    { name: 'learning_notes', metadata: { description: 'Notes and insights from learning' } }
  ];

  console.log('Setting up ChromaDB collections for your home AI...\n');

  for (const collection of collections) {
    try {
      // Try to get the collection first
      await client.getCollection({ name: collection.name });
      console.log(`✓ Collection '${collection.name}' already exists`);
    } catch (error) {
      // If it doesn't exist, create it
      await client.createCollection({
        name: collection.name,
        metadata: collection.metadata,
        embeddingFunction: new DefaultEmbeddingFunction()
      });
      console.log(`✓ Created collection: ${collection.name}`);
    }
  }

  // Add some starter examples
  console.log('\nAdding starter examples...');

  const codeCollection = await client.getCollection({ name: 'code_snippets' });
  
  await codeCollection.add({
    ids: ['python_async_example'],
    documents: [`Python async/await pattern for concurrent operations:

import asyncio
import aiohttp

async def fetch_data(session, url):
    async with session.get(url) as response:
        return await response.json()

async def main():
    urls = ['http://api1.com', 'http://api2.com']
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_data(session, url) for url in urls]
        results = await asyncio.gather(*tasks)
    return results

# Run the async function
data = asyncio.run(main())`],
    metadatas: [{
      language: 'python',
      type: 'async_pattern',
      tags: ['async', 'concurrent', 'api']
    }]
  });

  const configCollection = await client.getCollection({ name: 'configurations' });
  
  await configCollection.add({
    ids: ['docker_compose_template'],
    documents: [`Basic Docker Compose template with best practices:

version: '3.8'

services:
  app:
    build: .
    container_name: myapp
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    networks:
      - app-network

  db:
    image: postgres:15
    container_name: myapp-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: user
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - app-network

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge`],
    metadatas: [{
      type: 'docker-compose',
      service: 'template',
      tags: ['docker', 'compose', 'template']
    }]
  });

  console.log('✓ Added starter examples\n');
  console.log('Your ChromaDB is ready! Start adding your own knowledge:');
  console.log('- Code snippets you want to reuse');
  console.log('- Configuration files that work');
  console.log('- Solutions to problems you solve');
  console.log('- Documentation for your projects\n');
}

setupHomeCollections().catch(console.error);