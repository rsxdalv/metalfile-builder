#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import YAML from 'yaml';
import { z, ZodError } from 'zod';

const server = new McpServer({
  name: 'metalfile-mcp',
  version: '1.0.0'
});

const metalfileSchema = z
  .object({
    package: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        architecture: z.string().min(1),
        depends: z.array(z.string().min(1)).default([]),
        description: z.string().min(1)
      })
      .passthrough(),
    files: z
      .array(
        z
          .object({
            src: z.string().min(1),
            dest: z.string().min(1)
          })
          .passthrough()
      )
      .nonempty('files must contain at least one entry'),
    conffiles: z.array(z.string().min(1)).optional(),
    postinst: z.string().optional()
  })
  .passthrough();

const validateInputSchema = z
  .object({
    path: z.string().min(1).default('Metalfile.yml'),
    content: z.string().optional()
  })
  .passthrough();

const writeInputSchema = z
  .object({
    path: z.string().min(1).default('Metalfile.yml'),
    overwrite: z.boolean().default(true),
    package: metalfileSchema.shape.package,
    files: metalfileSchema.shape.files,
    conffiles: z.array(z.string().min(1)).optional(),
    postinst: z.string().optional()
  })
  .passthrough();

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

server.registerTool(
  'validate_metalfile',
  {
    description: 'Validate a Metalfile from disk (default Metalfile.yml) or provided YAML content.',
    inputSchema: validateInputSchema
  },
  async (rawInput) => {
    const parsedInput = validateInputSchema.safeParse(rawInput ?? {});
    if (!parsedInput.success) {
      return {
        content: [
          { type: 'text', text: `Invalid input for validate_metalfile:\n${formatZodError(parsedInput.error)}` }
        ]
      };
    }

    const { path: relPath, content } = parsedInput.data;
    const fullPath = path.resolve(process.cwd(), relPath);

    let yamlSource = content;
    if (!yamlSource) {
      try {
        yamlSource = await fs.readFile(fullPath, 'utf8');
      } catch (error) {
        return {
          content: [
            { type: 'text', text: `Failed to read Metalfile at ${fullPath}: ${(error as Error).message}` }
          ]
        };
      }
    }

    let parsedYaml: unknown;
    try {
      parsedYaml = YAML.parse(yamlSource);
    } catch (error) {
      return {
        content: [{ type: 'text', text: `YAML parse error: ${(error as Error).message}` }]
      };
    }

    const validation = metalfileSchema.safeParse(parsedYaml);
    if (!validation.success) {
      return {
        content: [
          { type: 'text', text: `Invalid Metalfile:\n${formatZodError(validation.error)}` }
        ]
      };
    }

    const pkg = validation.data.package;
    const filesCount = validation.data.files.length;
    const conffilesCount = validation.data.conffiles?.length ?? 0;
    const sourceLabel = content ? 'provided content' : fullPath;

    const summary = [
      `Metalfile is valid.`,
      `Source: ${sourceLabel}`,
      `Package: ${pkg.name}@${pkg.version}`,
      `Files entries: ${filesCount}`,
      ...(conffilesCount > 0 ? [`Conffiles entries: ${conffilesCount}`] : [])
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: summary
        }
      ]
    };
  }
);

server.registerTool(
  'write_metalfile',
  {
    description: 'Write a Metalfile to disk from structured input, with optional overwrite control.',
    inputSchema: writeInputSchema
  },
  async (rawInput) => {
    const parsedInput = writeInputSchema.safeParse(rawInput ?? {});
    if (!parsedInput.success) {
      return {
        content: [
          { type: 'text', text: `Invalid input for write_metalfile:\n${formatZodError(parsedInput.error)}` }
        ]
      };
    }

    const { path: relPath, overwrite, ...metalfile } = parsedInput.data;
    const fullPath = path.resolve(process.cwd(), relPath);

    if (!overwrite) {
      try {
        await fs.access(fullPath);
        return {
          content: [
            { type: 'text', text: `Refusing to overwrite existing file at ${fullPath}; set overwrite=true to replace.` }
          ]
        };
      } catch {
        // File does not exist; safe to proceed.
      }
    }

    const validated = metalfileSchema.parse(metalfile);
    const yamlText = YAML.stringify(validated, { lineWidth: 0 });

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, yamlText, 'utf8');

    return {
      content: [
        {
          type: 'text',
          text: `Wrote Metalfile to ${fullPath}\nPackage: ${validated.package.name}@${validated.package.version}\nFiles entries: ${validated.files.length}`
        }
      ]
    };
  }
);

server.registerTool(
  'suggest_write_metalfile_prompt',
  {
    description: 'Returns a ready-to-use prompt with hints for calling write_metalfile.',
    inputSchema: {}
  },
  async () => {
    const hint = [
      'Use the write_metalfile tool to emit a Metalfile to disk.',
      'Key fields: path (default Metalfile.yml), overwrite (default true), package (name, version, architecture, depends[], description), files[{src,dest}], optional conffiles[] (absolute dest paths for dpkg to preserve on upgrade), optional postinst string.',
      'Paths are resolved relative to the server working directory.',
      'Example payload:',
      JSON.stringify(
        {
          path: 'Metalfile.generated.yml',
          overwrite: true,
          package: {
            name: 'example-app',
            version: '1.0.0',
            architecture: 'all',
            depends: ['nodejs'],
            description: 'Example generated Metalfile'
          },
          files: [
            { src: './app/app.js', dest: '/opt/example-app/app.js' },
            { src: './app/package.json', dest: '/opt/example-app/package.json' },
            { src: './config/config.json', dest: '/etc/example-app/config.json' }
          ],
          conffiles: [
            '/etc/example-app/config.json'
          ],
          postinst: '#!/bin/bash\necho "postinst hook"'
        },
        null,
        2
      ),
      'Send the above object as the tool input when invoking write_metalfile.'
    ].join('\n');

    return { content: [{ type: 'text', text: hint }] };
  }
);

server.registerTool(
  'get_github_action_info',
  {
    description: 'Returns usage instructions and YAML for the metalfile-builder GitHub Action.',
    inputSchema: {}
  },
  async () => {
    const info = [
      'Use the metalfile-builder GitHub Action to build a Debian package in CI.',
      '',
      'Action: rsxdalv/metalfile-builder@v1',
      '',
      'Inputs:',
      '  manifest  - Path to the Metalfile (default: Metalfile.yml)',
      '',
      'Outputs:',
      '  package-path  - Full path to the built .deb file',
      '',
      'Example workflow:',
      '',
      '```yaml',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: Build Debian package from Metalfile',
      '        uses: rsxdalv/metalfile-builder@v1',
      '        with:',
      '          manifest: Metalfile.yml # defaults to Metalfile.yml in the repo root',
      '      - uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deb-package',
      '          path: dist/*.deb',
      '```'
    ].join('\n');

    return { content: [{ type: 'text', text: info }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('metalfile-mcp server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
