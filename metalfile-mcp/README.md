# metalfile-mcp

MCP server (Node.js + TypeScript) for working with Metalfile manifests. It can validate existing Metalfiles and generate new ones.

## Setup

- Install deps: `npm install`
- Run dev server: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`

## Tools

- `validate_metalfile`: validates a Metalfile from disk (default `Metalfile.yml`) or from provided YAML content.
- `write_metalfile`: writes a Metalfile to disk from structured input, with optional overwrite control and postinst script support.
