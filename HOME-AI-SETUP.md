# ChromaDB MCP Server - Home AI Setup Guide

Welcome to your ChromaDB MCP server! This tool will supercharge your home AI setup by giving your LLMs persistent memory and context awareness.

## What This Does

ChromaDB MCP (Model Context Protocol) server creates a bridge between your AI assistants (like Claude Desktop) and a vector database. This means:
- Your AI can remember past conversations and solutions
- Store and retrieve code patterns, configurations, and documentation
- Build your own knowledge base that grows over time
- Search through your stored context intelligently

## Quick Start

### 1. Install Prerequisites

```bash
# Install Bun (fast JavaScript runtime)
curl -fsSL https://bun.sh/install | bash

# Install Docker (for ChromaDB)
# Mac: Download Docker Desktop from docker.com
# Linux: sudo apt-get install docker.io docker-compose
```

### 2. Start ChromaDB

```bash
# Run ChromaDB locally
docker run -d \
  --name chromadb-local \
  -p 8001:8000 \
  -v ~/chromadb-data:/chroma/chroma \
  -e IS_PERSISTENT=TRUE \
  chromadb/chroma:latest

# Verify it's running
curl http://localhost:8001/api/v1/heartbeat
```

### 3. Set Up MCP Server

```bash
# Navigate to this directory
cd /Users/vinnieespo/Projects/ChromaDBMCPNVMe

# Install dependencies
bun install

# Test the connection
bun run test-chromadb.js

# Initialize collections
bun run setup-collections.js
```

### 4. Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chromadb-context": {
      "command": "bun",
      "args": ["run", "/Users/vinnieespo/Projects/ChromaDBMCPNVMe/index.js"],
      "env": {
        "CHROMADB_URL": "http://localhost:8001"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## How to Use

### In Claude Desktop

Once configured, you can say things like:
- "Store this Python script in ChromaDB with tags: automation, backup"
- "Search ChromaDB for Docker configuration examples"
- "Find similar React components to this one"
- "Remember this solution for setting up Kubernetes"

### Building Your Knowledge Base

1. **Code Patterns**: Store reusable code snippets
   ```
   "Store this React hook pattern in ChromaDB"
   ```

2. **Configuration Files**: Keep track of working configs
   ```
   "Save this docker-compose.yml as a reference"
   ```

3. **Solutions**: Document fixes for future reference
   ```
   "Store this GPU passthrough solution in ChromaDB"
   ```

4. **Project Context**: Build project-specific knowledge
   ```
   "Save this API documentation to ChromaDB"
   ```

## Collections Available

- **home_automation**: Smart home configs, scripts, automations
- **code_snippets**: Reusable code patterns
- **configurations**: System configs, docker-compose files
- **troubleshooting**: Solutions to problems you've solved
- **project_docs**: Documentation for your projects

## Advanced Usage

### Custom Collections

Create new collections for your specific needs:

```javascript
// In setup-collections.js, add:
await createCollection('ml_models', {
  description: 'Machine learning model configs and training scripts'
});
```

### Backup Your Knowledge

```bash
# Backup ChromaDB data
tar -czf chromadb-backup-$(date +%Y%m%d).tar.gz ~/chromadb-data/

# Restore from backup
tar -xzf chromadb-backup-20240613.tar.gz -C ~/
```

### Scale to Production

When ready, you can:
1. Deploy ChromaDB to a dedicated server
2. Use cloud-hosted ChromaDB
3. Share collections with team members

## Troubleshooting

### ChromaDB not connecting
```bash
# Check if Docker is running
docker ps | grep chromadb

# Restart ChromaDB
docker restart chromadb-local

# Check logs
docker logs chromadb-local
```

### MCP server errors
```bash
# Test standalone
bun run index.js

# Check ChromaDB URL
curl http://localhost:8001/api/v1/heartbeat
```

## Next Steps

1. Start storing useful code patterns
2. Build collections for your specific projects
3. Create automation scripts that use the stored context
4. Share your knowledge base with others

## Why This Matters

This setup gives you:
- **Persistent AI Memory**: Your AI assistant remembers solutions
- **Personal Knowledge Base**: Build your own Stack Overflow
- **Context Awareness**: AI understands your project structure
- **Reusable Patterns**: Never solve the same problem twice

Happy building! 🚀