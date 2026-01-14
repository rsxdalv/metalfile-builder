# Metalfile Builder

A tool to build Debian packages from YAML manifests, like a Dockerfile for .deb files.

## Installation

Build and install the tool:

```bash
./build.sh
sudo dpkg -i dist/metalfile_1.0_all.deb
```

## Usage

Create a `Metalfile.yml`:

```yaml
package:
  name: myapp
  version: 1.0
  architecture: all
  depends: [nodejs, nginx]
  description: My app

files:
  - src: app.js
    dest: /opt/myapp/app.js

postinst: |
  systemctl enable myapp
  systemctl start myapp
```

Then build:

```bash
metalfile build Metalfile.yml
```

This creates `myapp-1.0.deb`.

## Testing

Run a quick smoke test that builds a sample hello package and validates the contents:

```bash
bash tests/smoke.sh
```

## Features

- Declarative package building
- Supports maintainer scripts (postinst, prerm, postrm)
- File copying with relative paths
- Like Dockerfile, but for Debian packages

## Dependencies

- yq (for YAML parsing)
- dpkg-deb (for building)