# Security Policy

## Supported use

This project is intended to run as a local service under your control.

Basic security guidelines:
- Keep the service bound to `localhost` unless you have a specific reason not to.
- Do not commit `config.json`.
- Do not commit credential files.
- Review logs and rewrite rules before sharing or publishing customizations.
- Rotate credentials immediately if you suspect they have been compromised.

## Reporting a vulnerability

If you discover a security issue in the code or documentation, please report it privately to the maintainer before disclosing details publicly.

A helpful report includes:
- Affected file or component
- Potential impact
- Steps to reproduce
- Suggested fix, if you have one

## Sensitive files to keep local

Files that should never be committed to version control include:
- `config.json`
- Local smoke-test configs
- Credential files under `~/.claude/`
- Internal session notes or incident reports
