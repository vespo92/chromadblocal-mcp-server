#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ChromaClient } from 'chromadb';
import { writeFile, readFile } from 'fs/promises';

// Batch processing imports
import {
  scanDirectory,
  batchProcessFiles,
  processFile,
  exportCollection,
  importCollection,
  getDirectoryStats,
  FILE_TYPES,
  getFileCategory,
  generateDocId
} from './batch-processor.js';

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

        // ============================================
        // BATCH FILE PROCESSING TOOLS
        // ============================================

        case 'scan_directory': {
          const {
            path: dirPath,
            recursive = true,
            categories = null,
            extensions = null,
            max_files = 1000
          } = args;

          try {
            const files = await scanDirectory(dirPath, {
              recursive,
              categories: categories ? categories.split(',').map(c => c.trim()) : null,
              extensions: extensions ? extensions.split(',').map(e => e.trim().startsWith('.') ? e.trim() : `.${e.trim()}`) : null,
              maxFiles: max_files
            });

            const stats = await getDirectoryStats(dirPath, { recursive, maxFiles: max_files });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  directory: dirPath,
                  files_found: files.length,
                  stats,
                  sample_files: files.slice(0, 20),
                  has_more: files.length > 20
                }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error scanning directory: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'batch_ingest': {
          const {
            path: dirPath,
            collection = 'batch_files',
            recursive = true,
            categories = null,
            extensions = null,
            max_files = 500,
            include_content = true
          } = args;

          try {
            console.error(`📁 Scanning ${dirPath}...`);

            // Scan for files
            const files = await scanDirectory(dirPath, {
              recursive,
              categories: categories ? categories.split(',').map(c => c.trim()) : null,
              extensions: extensions ? extensions.split(',').map(e => e.trim().startsWith('.') ? e.trim() : `.${e.trim()}`) : null,
              maxFiles: max_files
            });

            console.error(`📄 Found ${files.length} files, processing...`);

            // Process files
            const { results, errors, stats } = await batchProcessFiles(files, {
              concurrency: 10,
              includeContent: include_content,
              basePath: dirPath,
              onProgress: (p) => {
                if (p.processed % 50 === 0) {
                  console.error(`⏳ Progress: ${p.percent}% (${p.processed}/${p.total})`);
                }
              }
            });

            console.error(`✅ Processed ${results.length} files, storing in ChromaDB...`);

            // Store in ChromaDB
            const client = await this.getLocalClient();
            const coll = await client.getOrCreateCollection({ name: collection });

            // Batch insert (ChromaDB limit is ~5000 per batch)
            const batchSize = 100;
            let stored = 0;

            for (let i = 0; i < results.length; i += batchSize) {
              const batch = results.slice(i, i + batchSize);

              await coll.add({
                ids: batch.map(r => r.id),
                documents: batch.map(r => r.content),
                metadatas: batch.map(r => ({
                  ...r.metadata,
                  batch_ingest: true,
                  source_directory: dirPath
                }))
              });

              stored += batch.length;
              console.error(`💾 Stored ${stored}/${results.length} documents`);
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  collection,
                  source_directory: dirPath,
                  files_found: files.length,
                  files_processed: stats.processed,
                  files_stored: stored,
                  errors: errors.length,
                  error_details: errors.slice(0, 10)
                }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error in batch ingest: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'quick_load': {
          const {
            path: dirPath,
            name = null,
            categories = null,
            extensions = null,
            max_files = 200
          } = args;

          try {
            // Create temp collection name
            const tempName = name || `temp_${Date.now()}`;
            console.error(`🚀 Quick loading to collection: ${tempName}`);

            // Scan and process
            const files = await scanDirectory(dirPath, {
              recursive: true,
              categories: categories ? categories.split(',').map(c => c.trim()) : null,
              extensions: extensions ? extensions.split(',').map(e => e.trim().startsWith('.') ? e.trim() : `.${e.trim()}`) : null,
              maxFiles: max_files
            });

            const { results, stats } = await batchProcessFiles(files, {
              concurrency: 20, // Higher concurrency for speed
              includeContent: true,
              basePath: dirPath
            });

            // Store quickly
            const client = await this.getLocalClient();
            const coll = await client.getOrCreateCollection({ name: tempName });

            // Single batch if possible
            if (results.length <= 500) {
              await coll.add({
                ids: results.map(r => r.id),
                documents: results.map(r => r.content),
                metadatas: results.map(r => ({
                  ...r.metadata,
                  temp_collection: true,
                  loaded_at: new Date().toISOString()
                }))
              });
            } else {
              // Batch insert
              for (let i = 0; i < results.length; i += 500) {
                const batch = results.slice(i, i + 500);
                await coll.add({
                  ids: batch.map(r => r.id),
                  documents: batch.map(r => r.content),
                  metadatas: batch.map(r => ({
                    ...r.metadata,
                    temp_collection: true,
                    loaded_at: new Date().toISOString()
                  }))
                });
              }
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  collection: tempName,
                  files_loaded: results.length,
                  source: dirPath,
                  tip: `Use 'search_context' with collection='${tempName}' to search. Use 'unload_collection' to remove when done.`
                }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error in quick load: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'unload_collection': {
          const { collection } = args;

          try {
            const client = await this.getLocalClient();
            await client.deleteCollection({ name: collection });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Collection '${collection}' has been unloaded and deleted`,
                  collection
                }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error unloading collection: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'export_collection': {
          const { collection, output_path = null } = args;

          try {
            const client = await this.getLocalClient();
            const data = await exportCollection(client, collection);

            if (output_path) {
              await writeFile(output_path, JSON.stringify(data, null, 2));
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    collection,
                    documents_exported: data.count,
                    output_file: output_path
                  }, null, 2),
                }],
              };
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(data, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error exporting collection: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'import_collection': {
          const { input_path, collection = null, overwrite = false } = args;

          try {
            const content = await readFile(input_path, 'utf-8');
            const data = JSON.parse(content);

            const client = await this.getLocalClient();
            const result = await importCollection(client, data, {
              collectionName: collection,
              overwrite
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  collection: result.collection,
                  documents_imported: result.imported,
                  source_file: input_path
                }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error importing collection: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'batch_delete': {
          const { collection, ids = null, where = null } = args;

          try {
            const client = await this.getLocalClient();
            const coll = await client.getCollection({ name: collection });

            if (ids) {
              const idList = Array.isArray(ids) ? ids : ids.split(',').map(id => id.trim());
              await coll.delete({ ids: idList });

              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    collection,
                    deleted_ids: idList.length
                  }, null, 2),
                }],
              };
            }

            if (where) {
              const whereClause = typeof where === 'string' ? JSON.parse(where) : where;
              await coll.delete({ where: whereClause });

              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    collection,
                    deleted_by_filter: true,
                    filter: whereClause
                  }, null, 2),
                }],
              };
            }

            return {
              content: [{
                type: 'text',
                text: 'Error: Must provide either "ids" or "where" parameter',
              }],
              isError: true,
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error in batch delete: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'get_collection_info': {
          const { collection } = args;

          try {
            const client = await this.getLocalClient();
            const coll = await client.getCollection({ name: collection });
            const count = await coll.count();
            const peek = await coll.peek({ limit: 5 });

            // Get category breakdown if available
            const categoryBreakdown = {};
            if (peek.metadatas) {
              for (const meta of peek.metadatas) {
                const cat = meta?.category || meta?.file_type || 'unknown';
                categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
              }
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  collection,
                  document_count: count,
                  sample_categories: categoryBreakdown,
                  sample_documents: peek.ids.map((id, idx) => ({
                    id,
                    metadata: peek.metadatas[idx],
                    content_preview: peek.documents[idx]?.slice(0, 200) + '...'
                  }))
                }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error getting collection info: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'ingest_file': {
          const { path: filePath, collection = 'files', metadata: extraMeta = {} } = args;

          try {
            const processed = await processFile(filePath, { includeContent: true });

            const client = await this.getLocalClient();
            const coll = await client.getOrCreateCollection({ name: collection });

            await coll.add({
              ids: [processed.id],
              documents: [processed.content],
              metadatas: [{
                ...processed.metadata,
                ...extraMeta,
                ingested_at: new Date().toISOString()
              }]
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  id: processed.id,
                  collection,
                  file: processed.metadata.filename,
                  type: processed.metadata.file_type,
                  size: processed.metadata.size_human
                }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error ingesting file: ${error.message}`,
              }],
              isError: true,
            };
          }
        }

        case 'list_file_types': {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                supported_types: Object.entries(FILE_TYPES).map(([type, config]) => ({
                  type,
                  category: config.category,
                  extensions: config.extensions,
                  text_extraction: config.extractText
                })),
                total_extensions: Object.values(FILE_TYPES).flatMap(t => t.extensions).length
              }, null, 2),
            }],
          };
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
          // ============================================
          // BATCH FILE PROCESSING TOOLS
          // ============================================
          {
            name: 'scan_directory',
            description: 'Scan a directory and get stats about files (photos, CAD, documents, code). Use this to preview before batch ingesting.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Directory path to scan',
                },
                recursive: {
                  type: 'boolean',
                  description: 'Scan subdirectories (default: true)',
                },
                categories: {
                  type: 'string',
                  description: 'Comma-separated file categories to include: images, cad, documents, data, code',
                },
                extensions: {
                  type: 'string',
                  description: 'Comma-separated file extensions to include (e.g., ".jpg,.png,.stl")',
                },
                max_files: {
                  type: 'number',
                  description: 'Maximum files to scan (default: 1000)',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'batch_ingest',
            description: 'Bulk ingest files from a directory into ChromaDB. Supports photos, CAD files, documents, and code with automatic metadata extraction.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Directory path to ingest files from',
                },
                collection: {
                  type: 'string',
                  description: 'Target collection name (default: batch_files)',
                },
                recursive: {
                  type: 'boolean',
                  description: 'Include subdirectories (default: true)',
                },
                categories: {
                  type: 'string',
                  description: 'Comma-separated categories: images, cad, documents, data, code',
                },
                extensions: {
                  type: 'string',
                  description: 'Comma-separated extensions to include',
                },
                max_files: {
                  type: 'number',
                  description: 'Maximum files to process (default: 500)',
                },
                include_content: {
                  type: 'boolean',
                  description: 'Extract and store file content for text files (default: true)',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'quick_load',
            description: 'FAST: Rapidly load files into a temporary collection for quick searching. Perfect for processing a batch of photos/CAD files then unloading.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Directory path to load',
                },
                name: {
                  type: 'string',
                  description: 'Collection name (auto-generated if not provided)',
                },
                categories: {
                  type: 'string',
                  description: 'File categories to include: images, cad, documents, data, code',
                },
                extensions: {
                  type: 'string',
                  description: 'Specific extensions to include',
                },
                max_files: {
                  type: 'number',
                  description: 'Maximum files (default: 200)',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'unload_collection',
            description: 'Delete/unload a collection when done processing. Use after quick_load to clean up temporary data.',
            inputSchema: {
              type: 'object',
              properties: {
                collection: {
                  type: 'string',
                  description: 'Name of collection to delete',
                },
              },
              required: ['collection'],
            },
          },
          {
            name: 'export_collection',
            description: 'Export a collection to JSON for backup or transfer to another system.',
            inputSchema: {
              type: 'object',
              properties: {
                collection: {
                  type: 'string',
                  description: 'Collection name to export',
                },
                output_path: {
                  type: 'string',
                  description: 'File path to save JSON (returns data directly if not provided)',
                },
              },
              required: ['collection'],
            },
          },
          {
            name: 'import_collection',
            description: 'Import a collection from a JSON export file.',
            inputSchema: {
              type: 'object',
              properties: {
                input_path: {
                  type: 'string',
                  description: 'Path to JSON file to import',
                },
                collection: {
                  type: 'string',
                  description: 'Override collection name (uses name from file if not provided)',
                },
                overwrite: {
                  type: 'boolean',
                  description: 'Delete existing collection before import (default: false)',
                },
              },
              required: ['input_path'],
            },
          },
          {
            name: 'batch_delete',
            description: 'Delete multiple documents from a collection by IDs or filter.',
            inputSchema: {
              type: 'object',
              properties: {
                collection: {
                  type: 'string',
                  description: 'Collection name',
                },
                ids: {
                  type: 'string',
                  description: 'Comma-separated document IDs to delete',
                },
                where: {
                  type: 'object',
                  description: 'Filter object to match documents for deletion (e.g., {"category": "image"})',
                },
              },
              required: ['collection'],
            },
          },
          {
            name: 'get_collection_info',
            description: 'Get detailed info about a collection including document count and sample data.',
            inputSchema: {
              type: 'object',
              properties: {
                collection: {
                  type: 'string',
                  description: 'Collection name',
                },
              },
              required: ['collection'],
            },
          },
          {
            name: 'ingest_file',
            description: 'Ingest a single file with automatic type detection and metadata extraction.',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'File path to ingest',
                },
                collection: {
                  type: 'string',
                  description: 'Target collection (default: files)',
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata to attach',
                },
              },
              required: ['path'],
            },
          },
          {
            name: 'list_file_types',
            description: 'List all supported file types and extensions for batch processing.',
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
