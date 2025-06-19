#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ChromaClient } from 'chromadb';

class ChromaContextMCP {
  constructor() {
    this.server = new Server(
      {
        name: 'chromadb-context',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.localClient = null;
    this.remoteClient = null;
    this.currentEnvironment = null;
    this.remoteUrl = null;
    this.routerEnabled = process.env.CHROMA_ROUTER_ENABLED === 'true';
    
    this.setupTools();
  }

  async getLocalClient() {
    if (!this.localClient) {
      this.localClient = new ChromaClient({
        path: process.env.CHROMA_URL || 'http://localhost:8001'
      });
    }
    return this.localClient;
  }

  async getRemoteClient() {
    if (!this.remoteClient && this.remoteUrl) {
      this.remoteClient = new ChromaClient({
        path: this.remoteUrl
      });
    }
    return this.remoteClient;
  }

  async getCurrentEnvironment() {
    if (!this.routerEnabled) {
      return null;
    }

    try {
      const client = await this.getLocalClient();
      const stateCollection = await client.getCollection({ name: 'vinos_state' });
      const result = await stateCollection.get({ ids: ['current_environment'] });
      
      if (result.metadatas && result.metadatas[0]) {
        this.currentEnvironment = result.metadatas[0].environment;
        console.error(`🌍 Current environment: ${this.currentEnvironment}`);
        
        // Get remote ChromaDB URL for this environment
        const envCollection = await client.getCollection({ name: 'vinos_environments' });
        const envResult = await envCollection.get({ ids: [`env_${this.currentEnvironment}`] });
        
        if (envResult.metadatas && envResult.metadatas[0] && envResult.metadatas[0].chromadb_remote) {
          this.remoteUrl = envResult.metadatas[0].chromadb_remote;
          console.error(`🔗 Remote ChromaDB: ${this.remoteUrl}`);
        }
      }
    } catch (error) {
      console.error(`⚠️ Could not get environment: ${error.message}`);
    }
    
    return this.currentEnvironment;
  }

  async routeQuery(query, collection) {
    if (!this.routerEnabled) {
      return 'local';
    }

    // Check if collection exists locally
    try {
      const localClient = await this.getLocalClient();
      const collections = await localClient.listCollections();
      const localCollectionNames = collections.map(c => c.name);
      
      if (localCollectionNames.includes(collection)) {
        console.error(`📍 Routing to local: ${collection} exists locally`);
        return 'local';
      }
    } catch (error) {
      console.error(`⚠️ Error checking local collections: ${error.message}`);
    }

    // Route based on collection patterns
    const localCollections = ['vinos_environments', 'vinos_state', 'mcp_registry', 'chromadb_routing', 'pattern_cache'];
    if (localCollections.includes(collection)) {
      return 'local';
    }

    // Default to remote if available
    return this.remoteClient ? 'remote' : 'local';
  }

  async getClient(preferredRoute = null) {
    if (!this.routerEnabled) {
      return this.getLocalClient();
    }

    // Initialize environment if needed
    if (!this.currentEnvironment) {
      await this.getCurrentEnvironment();
    }

    if (preferredRoute === 'remote' && this.remoteClient) {
      return this.getRemoteClient();
    }
    
    return this.getLocalClient();
  }

  setupTools() {
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'search_context': {
          const { query, collection = 'vinos_codebase', limit = 5 } = args;
          
          try {
            const route = await this.routeQuery(query, collection);
            const client = await this.getClient(route);
            
            console.error(`🔍 Searching in ${route} ChromaDB, collection: ${collection}`);
            
            const coll = await client.getOrCreateCollection({ name: collection });
            const results = await coll.query({
              queryTexts: [query],
              nResults: limit
            });

            const formattedResults = results.documents[0].map((doc, idx) => ({
              content: doc,
              metadata: results.metadatas[0][idx],
              distance: results.distances?.[0][idx],
              source: route
            }));

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(formattedResults, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error searching context: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'store_context': {
          const { content, metadata = {}, collection = 'vinos_codebase', id } = args;
          
          try {
            const localClient = await this.getLocalClient();
            const docId = id || `doc_${Date.now()}`;
            
            // Store locally first
            const localColl = await localClient.getOrCreateCollection({ name: collection });
            await localColl.add({
              ids: [docId],
              documents: [content],
              metadatas: [{
                ...metadata,
                stored_at: new Date().toISOString(),
                environment: this.currentEnvironment
              }]
            });
            
            return {
              content: [{
                type: 'text',
                text: 'Context stored successfully',
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error storing context: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'list_collections': {
          try {
            const localClient = await this.getLocalClient();
            const localCollections = await localClient.listCollections();
            
            let remoteCollections = [];
            if (this.remoteClient) {
              try {
                const remoteClient = await this.getRemoteClient();
                remoteCollections = await remoteClient.listCollections();
              } catch (remoteError) {
                console.error(`⚠️ Could not list remote collections: ${remoteError.message}`);
              }
            }
            
            const result = {
              local: localCollections.map(c => c.name),
              remote: remoteCollections.map(c => c.name),
              environment: this.currentEnvironment,
              remoteUrl: this.remoteUrl
            };
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error listing collections: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'find_similar_patterns': {
          const { code, limit = 5 } = args;
          
          try {
            let results = null;
            let source = 'local';
            
            // Try local first
            const localClient = await this.getLocalClient();
            try {
              const localColl = await localClient.getCollection({ name: 'component_patterns' });
              results = await localColl.query({
                queryTexts: [code],
                nResults: limit,
                where: { type: 'component' }
              });
            } catch (localError) {
              console.error(`⚠️ Local pattern search failed: ${localError.message}`);
            }
            
            // If no results and remote available, try remote
            if ((!results || results.documents[0].length === 0) && this.remoteClient) {
              try {
                const remoteClient = await this.getRemoteClient();
                const remoteColl = await remoteClient.getCollection({ name: 'component_patterns' });
                results = await remoteColl.query({
                  queryTexts: [code],
                  nResults: limit,
                  where: { type: 'component' }
                });
                source = 'remote';
                console.error(`✅ Found patterns in remote ChromaDB`);
              } catch (remoteError) {
                console.error(`⚠️ Remote pattern search failed: ${remoteError.message}`);
              }
            }

            if (!results || !results.documents[0]) {
              return {
                content: [{
                  type: 'text',
                  text: 'No similar patterns found',
                }],
              };
            }

            const patterns = results.documents[0].map((doc, idx) => ({
              pattern: doc,
              metadata: results.metadatas[0][idx],
              similarity: 1 - (results.distances?.[0][idx] || 0),
              source: source
            }));

            return {
              content: [{
                type: 'text',
                text: `Found ${patterns.length} similar patterns from ${source}:\n\n${patterns.map(p => 
                  `### ${p.metadata?.name || 'Pattern'} (${(p.similarity * 100).toFixed(1)}% similar)\n\`\`\`tsx\n${p.pattern}\n\`\`\`\n`
                ).join('\n')}`,
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error finding patterns: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'get_environment': {
          try {
            await this.getCurrentEnvironment();
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  current: this.currentEnvironment,
                  remoteUrl: this.remoteUrl,
                  routerEnabled: this.routerEnabled
                }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error getting environment: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_context',
            description: 'Search for relevant context in ChromaDB (automatically routes to local or remote)',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query',
                },
                collection: {
                  type: 'string',
                  description: 'Collection to search (default: vinos_codebase)',
                  enum: ['vinos_codebase', 'infrastructure_config', 'component_patterns', 'api_documentation', 'troubleshooting', 'vinos_environments', 'mcp_registry'],
                },
                limit: {
                  type: 'number',
                  description: 'Number of results (default: 5)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'store_context',
            description: 'Store new context in ChromaDB (stores locally and syncs to remote)',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Content to store',
                },
                metadata: {
                  type: 'object',
                  description: 'Metadata for the content',
                },
                collection: {
                  type: 'string',
                  description: 'Collection to store in',
                },
                id: {
                  type: 'string',
                  description: 'Optional document ID',
                },
              },
              required: ['content'],
            },
          },
          {
            name: 'list_collections',
            description: 'List all ChromaDB collections (both local and remote)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'find_similar_patterns',
            description: 'Find similar code patterns (searches local first, then remote)',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Code snippet to find similar patterns for',
                },
                limit: {
                  type: 'number',
                  description: 'Number of similar patterns to return',
                },
              },
              required: ['code'],
            },
          },
          {
            name: 'get_environment',
            description: 'Get current environment and ChromaDB routing info',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('ChromaDB Context MCP server v2.0.0 running with intelligent routing');
    
    // Initialize environment on startup
    if (this.routerEnabled) {
      await this.getCurrentEnvironment();
    }
  }
}

const server = new ChromaContextMCP();
server.run().catch(console.error);
