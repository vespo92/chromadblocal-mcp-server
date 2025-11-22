# ChromaDB MCP Server 🧠

A Model Context Protocol (MCP) server that gives AI assistants persistent memory through ChromaDB vector storage. **Now with EXIF extraction, Watch Folders, and Duplicate Detection** - the ultimate tool for creators!

[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector%20Database-orange)](https://www.trychroma.com/)
[![Bun](https://img.shields.io/badge/Bun-JavaScript%20Runtime-black)](https://bun.sh)
[![Version](https://img.shields.io/badge/version-3.0.0-green)](https://github.com/vespo92/chromadblocal-mcp-server)

## ✨ Features

### Core
- **Persistent AI Memory**: Your AI assistant remembers past conversations and solutions
- **Vector Search**: Find similar code patterns, configurations, and documentation instantly
- **Local First**: Run everything on your own hardware, no cloud dependencies

### 🚀 Batch Processing
- **Fast Batch Ingest**: Process entire directories in seconds (500+ files)
- **77 File Types**: Photos, CAD, documents, data files, code
- **Quick Load/Unload**: Temporary collections for rapid workflows
- **Export/Import**: Backup and transfer collections as JSON

### 📸 Photo Features (NEW in v3.0)
- **EXIF Extraction**: Camera, lens, exposure, GPS location, date taken
- **Search by Camera**: "Find photos shot with my Canon 5D"
- **Search by Location**: GPS coordinates embedded and searchable
- **Search by Date**: "Find photos from vacation 2024"

### 👁️ Watch Folders (NEW in v3.0)
- **Auto-Ingest**: Drop files in watched folders, auto-add to ChromaDB
- **Hands-Free**: Perfect for incoming photo dumps, downloads
- **Filter by Type**: Watch only for specific file types

### 🔍 Duplicate Detection (NEW in v3.0)
- **Find Duplicates**: Hash-based detection across directories
- **Reclaim Space**: See exactly how much space duplicates waste
- **Compare Files**: Check if two files are identical
- **Perceptual Hashing**: Find similar (not just identical) images

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) (JavaScript runtime)
- [Docker](https://docker.com) (for ChromaDB)
- [Claude Desktop](https://claude.ai/desktop) (or any MCP client)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com//vespo92/chromadblocal-mcp-server.git
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

## 🚀 Batch File Processing

The killer feature! Process massive amounts of files instantly for AI-powered search and retrieval.

### Quick Load Workflow (Fastest)

Perfect for "load, process, discard" workflows:

```
You: "Quick load my photos from /home/photos/vacation2024"
AI: Creates temp collection, ingests 500 photos in seconds
You: "Find photos with mountains or beaches"
AI: Returns matching photos with metadata
You: "Unload the collection"
AI: Cleans up, frees memory
```

### Supported File Types

| Category | Extensions | Metadata Extracted |
|----------|------------|-------------------|
| **Images** | .jpg, .jpeg, .png, .heic, .raw, .cr2, .nef, .arw, .tiff, .gif, .webp | Dimensions, size, format |
| **CAD** | .stl, .obj, .dxf, .dwg, .step, .iges, .fbx, .blend, .skp, .scad | Vertices, faces, format |
| **Documents** | .pdf, .txt, .md, .doc, .docx, .rtf | Full text content |
| **Data** | .json, .yaml, .xml, .csv, .toml, .ini | Parsed content |
| **Code** | .js, .ts, .py, .go, .rs, .java, .cpp, .c, .php, .rb + 20 more | Full source code |

### Batch Processing Examples

```
"Scan /projects/cad-files to see what's there"
"Batch ingest all STL files from /3d-prints into the 'print_library' collection"
"Quick load my Downloads folder, find anything mentioning 'invoice'"
"Export the photo_archive collection to backup.json"
"Import backup.json into a new collection called 'restored_photos'"
```

### Processing Speed

- **Quick Load**: ~200 files in 2-3 seconds
- **Batch Ingest**: ~500 files in 5-10 seconds (with full metadata)
- **Concurrent Processing**: 10-20 parallel file operations
- **No external dependencies**: Pure JavaScript/Bun processing

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

### Batch Processing Tools

#### `scan_directory`
Preview files in a directory before ingesting
```
Parameters:
- path: Directory to scan
- categories: Filter by type (images, cad, documents, data, code)
- extensions: Filter by extension (.jpg, .stl, etc.)
- recursive: Include subdirectories (default: true)
```

#### `batch_ingest`
Bulk ingest files into ChromaDB with full metadata
```
Parameters:
- path: Source directory
- collection: Target collection name
- categories: File types to include
- max_files: Limit number of files
```

#### `quick_load`
🚀 FAST: Rapidly load files for temporary processing
```
Parameters:
- path: Directory to load
- name: Collection name (auto-generated if omitted)
- categories: File types to include
```

#### `unload_collection`
Delete a collection (cleanup after quick_load)
```
Parameters:
- collection: Name of collection to delete
```

#### `export_collection`
Export collection to JSON file
```
Parameters:
- collection: Collection to export
- output_path: File path for JSON output
```

#### `import_collection`
Import collection from JSON file
```
Parameters:
- input_path: JSON file to import
- collection: Override collection name
- overwrite: Delete existing first (default: false)
```

#### `get_collection_info`
Get detailed stats about a collection
```
Parameters:
- collection: Collection name
```

#### `ingest_file`
Ingest a single file with metadata extraction
```
Parameters:
- path: File to ingest
- collection: Target collection
```

#### `list_file_types`
Show all supported file extensions

### EXIF & Photo Tools

#### `extract_exif`
Extract detailed EXIF metadata from photos
```
Parameters:
- path: Path to JPEG or TIFF image
Returns: Camera, lens, exposure, GPS, date taken
```

### Watch Folder Tools

#### `watch_folder`
Start auto-ingesting new files from a folder
```
Parameters:
- path: Folder to watch
- collection: Target collection (default: auto_ingest)
- categories: File types to watch
- include_exif: Extract EXIF from photos (default: true)
```

#### `stop_watch`
Stop watching a folder
```
Parameters:
- path: Folder to stop watching
```

#### `list_watchers`
List all active folder watchers

### Duplicate Detection Tools

#### `find_duplicates`
Scan directory for duplicate files
```
Parameters:
- path: Directory to scan
- hash_method: "partial" (fast), "full" (thorough), "perceptual" (images)
- categories: File types to check
Returns: Duplicate groups with wasted space info
```

#### `compare_files`
Check if two files are duplicates
```
Parameters:
- file1: First file path
- file2: Second file path
```

#### `find_collection_duplicates`
Find duplicate entries in a ChromaDB collection
```
Parameters:
- collection: Collection name
```

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
├── index.js                    # MCP server with 22 tools
├── batch-processor.js          # Fast batch file processing engine
├── exif-extractor.js           # EXIF metadata extraction for photos
├── watch-folder.js             # Auto-ingest watch folder system
├── duplicate-detector.js       # Duplicate file detection
├── setup-home-collections.js   # Collection initialization
├── test-chromadb.js           # Connection test script
├── test-mcp.js                # MCP functionality test
├── test-batch-processor.js    # Batch processing tests
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

- ✅ ~~Export/import collections~~ **DONE!**
- ✅ ~~Batch file processing~~ **DONE!**
- ✅ ~~EXIF metadata extraction~~ **DONE in v3.0!**
- ✅ ~~Watch folders / auto-ingest~~ **DONE in v3.0!**
- ✅ ~~Duplicate detection~~ **DONE in v3.0!**
- Cloud sync capabilities
- Multi-user support
- Web UI for collection management
- AI-powered image descriptions (what's in the photo)
- 3D print analysis (volume, time estimates)

---

**Built with ❤️ for the Home AI Community**
