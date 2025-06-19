# Contributing to ChromaDB MCP Server

First off, thank you for considering contributing to ChromaDB MCP Server! It's people like you that make this tool better for everyone in the home AI community.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (code snippets, error messages)
- **Describe the behavior you observed and expected**
- **Include your environment details** (OS, Bun version, Docker version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the proposed functionality
- **Include examples** of how it would be used
- **Explain why** this enhancement would be useful

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. Ensure the test suite passes (`bun test`)
4. Make sure your code follows the existing style
5. Issue that pull request!

## Development Process

1. **Set up your development environment**
   ```bash
   git clone https://github.com/yourusername/chromadb-mcp-server.git
   cd chromadb-mcp-server
   bun install
   ```

2. **Start ChromaDB for development**
   ```bash
   docker run -d \
     --name chromadb-dev \
     -p 8001:8000 \
     chromadb/chroma:latest
   ```

3. **Run tests**
   ```bash
   bun test
   ```

4. **Test MCP integration**
   ```bash
   bun run test-mcp.js
   ```

## Code Style

- Use ES modules (import/export)
- Follow existing naming conventions
- Add JSDoc comments for new functions
- Keep functions focused and small
- Use async/await for asynchronous code

## Adding New Collections

To add a new default collection:

1. Edit `setup-home-collections.js`
2. Add your collection to the `collections` array
3. Include meaningful metadata
4. Consider adding starter examples

Example:
```javascript
{ 
  name: 'your_collection', 
  metadata: { 
    description: 'Clear description of purpose' 
  } 
}
```

## Adding New MCP Tools

When adding new MCP tools:

1. Define the tool in `index.js`
2. Follow the MCP protocol specification
3. Include comprehensive parameter descriptions
4. Add error handling
5. Update the README with usage examples

## Documentation

- Update README.md for user-facing changes
- Update HOME-AI-SETUP.md for setup changes
- Include code comments for complex logic
- Add examples for new features

## Community Guidelines

- Be welcoming to newcomers
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards others

## Questions?

Feel free to open an issue with the "question" label if you need clarification on anything!

Thank you for contributing! 🎉