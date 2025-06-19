# ChromaDB MCP Server 🧠

A Model Context Protocol (MCP) server that gives AI assistants persistent memory through ChromaDB vector storage. Build your own knowledge base that grows with every interaction!

[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector%20Database-orange)](https://www.trychroma.com/)
[![Bun](https://img.shields.io/badge/Bun-JavaScript%20Runtime-black)](https://bun.sh)

## ✨ Features

- **Persistent AI Memory**: Your AI assistant remembers past conversations and solutions
- **Vector Search**: Find similar code patterns, configurations, and documentation instantly
- **Easy Integration**: Works seamlessly with Claude Desktop and other MCP-compatible clients
- **Home AI Ready**: Pre-configured collections for personal projects and automation
- **Local First**: Run everything on your own hardware, no cloud dependencies

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) (JavaScript runtime)
- [Docker](https://docker.com) (for ChromaDB)
- [Claude Desktop](https://claude.ai/desktop) (or any MCP client)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/chromadb-mcp-server.git
   cd chromadb-mcp-server
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Start ChromaDB**
   ```bash
   docker run -d \
     --name chromadb-local \
     -p 8001:8000 \
     -v ~/chromadb-data:/chroma/chroma \
     -e IS_PERSISTENT=TRUE \
     chromadb/chroma:latest
   ```

4. **Initialize collections**
   ```bash
   bun run setup
   ```

5. **Configure Claude Desktop**
   
   Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "chromadb-context": {
         "command": "bun",
         "args": ["run", "/path/to/chromadb-mcp-server/index.js"],
         "env": {
           "CHROMADB_URL": "http://localhost:8001"
         }
       }
     }
   }
   ```

6. **Restart Claude Desktop** and start building your knowledge base!

## 💬 Usage Examples

Once configured, interact naturally with your AI:

### Store Knowledge
- "Store this Docker configuration in ChromaDB for future reference"
- "Save this React component pattern with tags: hooks, authentication"
- "Remember this solution for GPU passthrough issues"

### Retrieve Information
- "Search ChromaDB for Python async examples"
- "Find similar component patterns to this one"
- "What solutions do we have for Docker networking issues?"

### Build Context
- "Add this API documentation to the project_docs collection"
- "Store these test patterns for our testing suite"

## 📚 Available Collections

| Collection | Description | Use Case |
|------------|-------------|----------|
| `home_automation` | Smart home configs & automations | Home Assistant, IoT scripts |
| `code_snippets` | Reusable code patterns | Functions, hooks, utilities |
| `configurations` | System & app configs | Docker, Kubernetes, services |
| `troubleshooting` | Problem solutions | Fixes, workarounds, debugging |
| `project_docs` | Project documentation | APIs, architecture, guides |
| `learning_notes` | Learning insights | Tutorials, concepts, notes |

## 🛠️ MCP Tools

### `search_context`
Search for relevant information across collections
```
Parameters:
- query: Search query
- collection: (optional) Specific collection to search
- limit: (optional) Number of results
```

### `store_context`
Store new information with metadata
```
Parameters:
- content: The content to store
- metadata: Tags, categories, descriptions
- collection: Target collection
```

### `list_collections`
List all available collections and their metadata

### `find_similar_patterns`
Find code patterns similar to provided example

## 🔧 Configuration

### Environment Variables
```bash
CHROMADB_URL=http://localhost:8001  # ChromaDB server URL
```

### Custom Collections

Add new collections in `setup-home-collections.js`:
```javascript
await createCollection('ml_experiments', {
  description: 'Machine learning experiments and results'
});
```

## 📦 Project Structure

```
chromadb-mcp-server/
├── index.js                    # MCP server implementation
├── setup-home-collections.js   # Collection initialization
├── test-chromadb.js           # Connection test script
├── test-mcp.js                # MCP functionality test
├── HOME-AI-SETUP.md           # Detailed setup guide
├── package.json               # Project dependencies
└── README.md                  # This file
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for the MCP specification
- [Chroma](https://trychroma.com) for the excellent vector database
- The open-source community for inspiration and support

## 🚀 What's Next?

- Cloud sync capabilities
- Multi-user support
- Web UI for collection management
- Export/import collections
- Integration with more AI assistants

---

**Built with ❤️ for the Home AI Community**